import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://guozdhpnfwcxhxkzflfz.supabase.co";
const SUPABASE_SERVICE_ROLE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd1b3pkaHBuZndjeGh4a3pmbGZ6Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NTY3NTc5OCwiZXhwIjoyMTAxMjUxNzk4fQ._NdLntHHnRnKUwND3I-kQHkMdg5ndFAajUvbqPrXtq8";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function seedUsers() {
  console.log("Seeding Supabase Auth users for boutq-incubator-db...");

  const usersToCreate = [
    {
      email: "admin@boutq.com",
      password: "Password123!",
      fullName: "Boutq Admin",
      role: "admin",
    },
    {
      email: "cashier@boutq.com",
      password: "Password123!",
      fullName: "Boutq Cashier",
      role: "cashier",
    },
  ];

  const BRAND_ID = "00000000-0000-0000-0000-000000000001"; // boutq brand ID

  for (const u of usersToCreate) {
    // Check if user already exists
    const { data: existingList } = await supabase.auth.admin.listUsers();
    const existing = existingList?.users?.find((x) => x.email === u.email);

    let userId = existing?.id;

    if (!existing) {
      const { data: created, error: createErr } = await supabase.auth.admin.createUser({
        email: u.email,
        password: u.password,
        email_confirm: true,
        user_metadata: {
          full_name: u.fullName,
          role: u.role,
        },
      });

      if (createErr) {
        console.error(`Failed to create user ${u.email}:`, createErr.message);
        continue;
      }
      userId = created.user.id;
      console.log(`Created Auth User: ${u.email} (ID: ${userId})`);
    } else {
      console.log(`Auth User already exists: ${u.email} (ID: ${userId})`);
      // Update password just in case
      await supabase.auth.admin.updateUserById(userId, {
        password: u.password,
        email_confirm: true,
      });
    }

    // Insert or update profile
    const { error: profileErr } = await supabase.from("profiles").upsert(
      {
        id: userId,
        email: u.email,
        full_name: u.fullName,
        name: u.fullName,
        role: u.role,
        status: "active",
        brand_id: BRAND_ID,
      },
      { onConflict: "id" }
    );

    if (profileErr) {
      console.error(`Failed to upsert profile for ${u.email}:`, profileErr.message);
    } else {
      console.log(`Upserted Profile for: ${u.email} with role '${u.role}'`);
    }
  }

  console.log("\n--- SEEDING COMPLETED SUCCESSFULLY ---");
}

seedUsers().catch(console.error);
