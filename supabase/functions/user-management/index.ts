import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.49.1";

// This function is authenticated with a bearer token and never uses cookies.
// Allow all browser origins so custom storefront/admin domains can call it;
// authorization and role checks below remain the security boundary.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Create admin client with service role key
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    // Get the authorization header
    const authHeader = req.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Missing or invalid authorization header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = authHeader.replace("Bearer ", "");
    const anonKey =
      Deno.env.get("SUPABASE_ANON_KEY") ??
      Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ??
      Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY") ??
      "";

    if (!anonKey) {
      return new Response(
        JSON.stringify({ error: "Missing SUPABASE_ANON_KEY or SUPABASE_PUBLISHABLE_KEY" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Create user client to verify the caller's identity
    const userClient = createClient(supabaseUrl, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    });

    // Verify the caller is authenticated
    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized: invalid session" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const url = new URL(req.url);
    const action = url.searchParams.get("action");

    // All other actions require admin role.
    // SECURITY: fail closed. A missing profile (lookup error, race condition,
    // not-yet-provisioned account, etc.) must NOT be treated as admin access.
    const { data: callerProfile, error: callerProfileError } = await supabase
      .from("profiles")
      .select("role, status, email, brand_id")
      .eq("id", user.id)
      .maybeSingle();

    if (callerProfileError || !callerProfile) {
      return new Response(
        JSON.stringify({ error: "Forbidden: no profile found for this account" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const callerRole: string = callerProfile.role;
    const isAdmin =
      callerRole === "admin" || callerRole === "super_admin" || callerRole === "brand_admin";
    // Role is the sole authority. Never infer privileges from an editable
    // profile field such as email.
    const isSuperAdmin = callerRole === "super_admin";
    const isActive = callerProfile.status === "active";

    if (!isActive) {
      return new Response(JSON.stringify({ error: "Forbidden: account inactive or suspended" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!isAdmin) {
      return new Response(JSON.stringify({ error: "Forbidden: admin role required" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const callerCtx = {
      userId: user.id,
      isSuperAdmin,
      callerBrandId: callerProfile?.brand_id ?? null,
    };

    // Handle different actions
    switch (action) {
      case "list": {
        return await handleList(supabase, callerCtx);
      }

      case "create": {
        const body = await req.json();
        return await handleCreate(supabase, body, callerCtx);
      }

      case "update": {
        const body = await req.json();
        return await handleUpdate(supabase, body, callerCtx);
      }

      case "delete": {
        const body = await req.json();
        return await handleDelete(supabase, body, callerCtx);
      }

      default:
        return new Response(
          JSON.stringify({ error: "Invalid action. Use: list, create, update, delete" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
    }
  } catch (err) {
    console.error("[user-management] Error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

async function handleList(
  supabase: any,
  ctx: { isSuperAdmin: boolean; callerBrandId: string | null },
) {
  let query = supabase
    .from("profiles")
    .select(
      "id, email, name, phone, role, status, brand_id, created_at, updated_at, brand:brands(id, slug, name_en, name_ar, logo_url, is_active)",
    )
    .order("created_at", { ascending: false });

  // Non-super-admins only see profiles inside their own brand
  if (!ctx.isSuperAdmin) {
    if (!ctx.callerBrandId) {
      return new Response(JSON.stringify({ profiles: [] }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    query = query.eq("brand_id", ctx.callerBrandId).neq("role", "super_admin");
  }

  const { data: profiles, error } = await query;
  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const visibleProfiles = ctx.isSuperAdmin
    ? (profiles ?? [])
    : (profiles ?? []).filter((profile: any) => profile.role !== "super_admin");
  return new Response(JSON.stringify({ profiles: visibleProfiles }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function handleCreate(
  supabase: any,
  body: any,
  ctx: { userId: string; isSuperAdmin: boolean; callerBrandId: string | null },
) {
  const { email, name, phone, role, password } = body;
  let { brand_id } = body;

  const normalizedEmail = String(email ?? "")
    .trim()
    .toLowerCase();

  if (!normalizedEmail) {
    return new Response(JSON.stringify({ error: "Email is required" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const userRole = role || "staff";
  const validRoles = ctx.isSuperAdmin
    ? ["super_admin", "admin", "brand_admin", "staff", "courier"]
    : ["staff", "courier"]; // brand admins/admins may create operational roles only
  if (!validRoles.includes(userRole)) {
    return new Response(
      JSON.stringify({ error: `Invalid role. Allowed: ${validRoles.join(", ")}` }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  // Force brand for non-super-admins
  if (!ctx.isSuperAdmin) {
    brand_id = ctx.callerBrandId;
    if (!brand_id) {
      return new Response(JSON.stringify({ error: "Your account has no brand assigned" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  }
  // Every non-platform role must have a brand.
  if ((userRole === "brand_admin" || userRole === "staff" || userRole === "courier") && !brand_id) {
    return new Response(JSON.stringify({ error: "brand_id is required for this role" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Supabase Auth has one global email namespace. A shopper may therefore
  // already own this identity even though they have never had team access.
  // Reuse that identity and attach only the separate team profile/role.
  const existingAuthUser = await findAuthUserByEmail(supabase, normalizedEmail);
  let userId = existingAuthUser?.id as string | undefined;
  let createdAuthUser = false;

  if (userId) {
    const { data: existingProfile, error: existingProfileError } = await supabase
      .from("profiles")
      .select("id, role, status, brand_id")
      .eq("id", userId)
      .maybeSingle();
    if (existingProfileError) {
      return new Response(JSON.stringify({ error: existingProfileError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Team access and customer CRM data are separate concerns. An Auth user
    // with no profile, or the unassigned default profile created by the auth
    // trigger, has no active workforce access and may be attached to this
    // brand by an authorized admin. Customer rows are deliberately untouched.
    const isAvailableForTeamAccess =
      !existingProfile || (existingProfile.brand_id === null && existingProfile.role === "staff");
    if (!isAvailableForTeamAccess) {
      return new Response(
        JSON.stringify({
          error: "This email already has a team account. Edit the existing team member instead.",
          code: "TEAM_ACCOUNT_EXISTS",
        }),
        {
          status: 409,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }
  } else {
    if (!String(password ?? "").trim()) {
      return new Response(
        JSON.stringify({ error: "A temporary password is required for a new account" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email: normalizedEmail,
      password,
      email_confirm: true,
      user_metadata: { name: name || normalizedEmail.split("@")[0] },
    });
    if (authError) {
      return new Response(JSON.stringify({ error: authError.message }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    userId = authData.user?.id;
    createdAuthUser = true;
  }

  if (!userId) {
    return new Response(JSON.stringify({ error: "Failed to create user: no user ID returned" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const updatePayload: Record<string, any> = {
    id: userId,
    email: normalizedEmail,
    name: name || normalizedEmail.split("@")[0],
    phone: phone ? String(phone).trim() : null,
    role: userRole,
    status: "active",
  };
  if (userRole !== "super_admin") {
    updatePayload.brand_id = brand_id ?? null;
  } else {
    updatePayload.brand_id = null;
  }

  // Upsert removes the race with the auth-user trigger: whether the trigger has
  // already inserted the profile or not, creation finishes in one deterministic state.
  const { error: profileUpdateError } = await supabase
    .from("profiles")
    .upsert(updatePayload, { onConflict: "id" });

  if (profileUpdateError) {
    console.error("[user-management] Profile update error:", profileUpdateError);
    // Do not leave an inaccessible orphaned auth account when profile creation fails.
    if (createdAuthUser) {
      await supabase.auth.admin.deleteUser(userId).catch(() => undefined);
    }
    return new Response(
      JSON.stringify({ error: `Failed to create user profile: ${profileUpdateError.message}` }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  return new Response(
    JSON.stringify({
      success: true,
      linked_existing_identity: !createdAuthUser,
      user: {
        id: userId,
        email: normalizedEmail,
        name: name || normalizedEmail.split("@")[0],
        phone: updatePayload.phone,
        role: userRole,
        brand_id: updatePayload.brand_id,
        status: "active",
      },
    }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
}

async function handleUpdate(
  supabase: any,
  body: any,
  ctx: { userId: string; isSuperAdmin: boolean; callerBrandId: string | null },
) {
  const { userId, role, status, name, phone, brand_id, password } = body;

  if (!userId) {
    return new Response(JSON.stringify({ error: "userId is required" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { data: target, error: targetError } = await supabase
    .from("profiles")
    .select("role, email, brand_id")
    .eq("id", userId)
    .maybeSingle();

  if (targetError || !target) {
    return new Response(JSON.stringify({ error: "User profile not found" }), {
      status: 404,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const targetIsSuperAdmin = target.role === "super_admin";

  if (targetIsSuperAdmin && !ctx.isSuperAdmin) {
    return new Response(JSON.stringify({ error: "Only a super admin can modify a super admin" }), {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Non-super-admins can only touch users in their own brand
  if (!ctx.isSuperAdmin && (!ctx.callerBrandId || target.brand_id !== ctx.callerBrandId)) {
    return new Response(JSON.stringify({ error: "You can only manage users in your own brand" }), {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // 1. If password is provided, update the auth password directly
  if (password !== undefined && String(password).trim().length > 0) {
    const { error: authUpdateError } = await supabase.auth.admin.updateUserById(userId, {
      password: String(password).trim(),
    });
    if (authUpdateError) {
      return new Response(
        JSON.stringify({ error: `Failed to update password in auth: ${authUpdateError.message}` }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }
  }

  const validRoles = ctx.isSuperAdmin
    ? ["super_admin", "admin", "brand_admin", "staff", "courier"]
    : ["staff", "courier"];

  const updates: Record<string, any> = {};
  if (role !== undefined) {
    if (!validRoles.includes(role)) {
      return new Response(
        JSON.stringify({ error: `Invalid role. Allowed: ${validRoles.join(", ")}` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    updates.role = role;
  }
  if (status !== undefined) {
    if (!["active", "inactive"].includes(status)) {
      return new Response(
        JSON.stringify({ error: "Invalid status. Must be 'active' or 'inactive'" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    updates.status = status;
  }
  if (name !== undefined) {
    updates.name = name;
  }
  if (phone !== undefined) {
    updates.phone = phone ? String(phone).trim() : null;
  }
  // Only super admin can reassign brand_id
  if (brand_id !== undefined && ctx.isSuperAdmin) {
    updates.brand_id = brand_id;
  }

  // If we only updated the password, we can return success directly without modifying profiles table
  if (Object.keys(updates).length === 0) {
    return new Response(
      JSON.stringify({ success: true, message: "Password updated successfully" }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  const { error } = await supabase.from("profiles").update(updates).eq("id", userId);

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (status === "inactive") {
    try {
      await supabase.auth.admin.signOut(userId, "global");
    } catch (_) {}
  }

  return new Response(JSON.stringify({ success: true }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function handleDelete(
  supabase: any,
  body: any,
  ctx: { userId: string; isSuperAdmin: boolean; callerBrandId: string | null },
) {
  const { userId } = body;

  if (!userId) {
    return new Response(JSON.stringify({ error: "userId is required" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (userId === ctx.userId) {
    return new Response(JSON.stringify({ error: "You cannot delete your own account" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { data: target, error: targetError } = await supabase
    .from("profiles")
    .select("role, email, brand_id")
    .eq("id", userId)
    .maybeSingle();

  if (targetError || !target) {
    return new Response(JSON.stringify({ error: "User profile not found" }), {
      status: 404,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (target.role === "super_admin" && !ctx.isSuperAdmin) {
    return new Response(JSON.stringify({ error: "Only a super admin can delete a super admin" }), {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  if (!ctx.isSuperAdmin && (!ctx.callerBrandId || target.brand_id !== ctx.callerBrandId)) {
    return new Response(JSON.stringify({ error: "You can only delete users in your own brand" }), {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { count: customerIdentityCount, error: customerIdentityError } = await supabase
    .from("customers")
    .select("id", { count: "exact", head: true })
    .eq("auth_user_id", userId);
  if (customerIdentityError) {
    return new Response(JSON.stringify({ error: customerIdentityError.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Removing employment must never delete an independently owned storefront
  // customer account, its orders, addresses, or password.
  if ((customerIdentityCount ?? 0) > 0) {
    const { error: unlinkError } = await supabase.from("profiles").upsert(
      {
        id: userId,
        email: target.email,
        name: target.email?.split("@")[0] || "Customer",
        role: "staff",
        status: "active",
        brand_id: null,
      },
      { onConflict: "id" },
    );
    if (unlinkError) {
      return new Response(JSON.stringify({ error: unlinkError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    try {
      await supabase.auth.admin.signOut(userId, "global");
    } catch (_) {}
    return new Response(JSON.stringify({ success: true, identity_preserved: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { error } = await supabase.auth.admin.deleteUser(userId);

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ success: true }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function findAuthUserByEmail(supabase: any, email: string) {
  // The Admin API does not expose a direct get-by-email method. Walk bounded
  // pages so this remains reliable after the project grows beyond 1,000 users.
  for (let page = 1; page <= 100; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    const users = data?.users ?? [];
    const match = users.find(
      (user: any) =>
        String(user.email ?? "")
          .trim()
          .toLowerCase() === email,
    );
    if (match) return match;
    if (users.length < 1000) break;
  }
  return null;
}
