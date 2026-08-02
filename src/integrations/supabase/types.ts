export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5";
  };
  public: {
    Tables: {
      activity_logs: {
        Row: {
          action: string;
          brand_id: string;
          created_at: string;
          id: string;
          message_ar: string;
          message_en: string;
          metadata: Json;
          order_id: string | null;
          product_id: string | null;
          user_id: string;
          variant_id: string | null;
        };
        Insert: {
          action: string;
          brand_id: string;
          created_at?: string;
          id?: string;
          message_ar: string;
          message_en: string;
          metadata?: Json;
          order_id?: string | null;
          product_id?: string | null;
          user_id: string;
          variant_id?: string | null;
        };
        Update: {
          action?: string;
          brand_id?: string;
          created_at?: string;
          id?: string;
          message_ar?: string;
          message_en?: string;
          metadata?: Json;
          order_id?: string | null;
          product_id?: string | null;
          user_id?: string;
          variant_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "activity_logs_brand_id_fkey";
            columns: ["brand_id"];
            isOneToOne: false;
            referencedRelation: "brands";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "activity_logs_order_id_fkey";
            columns: ["order_id"];
            isOneToOne: false;
            referencedRelation: "orders";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "activity_logs_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "activity_logs_variant_id_fkey";
            columns: ["variant_id"];
            isOneToOne: false;
            referencedRelation: "product_variants";
            referencedColumns: ["id"];
          },
        ];
      };
      api_quota_usage: {
        Row: {
          action: string;
          request_count: number;
          user_id: string;
          window_start: string;
        };
        Insert: {
          action: string;
          request_count?: number;
          user_id: string;
          window_start: string;
        };
        Update: {
          action?: string;
          request_count?: number;
          user_id?: string;
          window_start?: string;
        };
        Relationships: [];
      };
      app_config: {
        Row: {
          created_at: string | null;
          id: string;
          updated_at: string | null;
        };
        Insert: {
          created_at?: string | null;
          id?: string;
          updated_at?: string | null;
        };
        Update: {
          created_at?: string | null;
          id?: string;
          updated_at?: string | null;
        };
        Relationships: [];
      };
      branches: {
        Row: {
          address_ar: string | null;
          address_en: string | null;
          brand_id: string;
          created_at: string;
          id: string;
          is_active: boolean;
          location_ar: string | null;
          location_en: string | null;
          name_ar: string | null;
          name_en: string | null;
          notes_ar: string | null;
          notes_en: string | null;
          phone: string | null;
          sort_order: number;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          address_ar?: string | null;
          address_en?: string | null;
          brand_id: string;
          created_at?: string;
          id?: string;
          is_active?: boolean;
          location_ar?: string | null;
          location_en?: string | null;
          name_ar?: string | null;
          name_en?: string | null;
          notes_ar?: string | null;
          notes_en?: string | null;
          phone?: string | null;
          sort_order?: number;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          address_ar?: string | null;
          address_en?: string | null;
          brand_id?: string;
          created_at?: string;
          id?: string;
          is_active?: boolean;
          location_ar?: string | null;
          location_en?: string | null;
          name_ar?: string | null;
          name_en?: string | null;
          notes_ar?: string | null;
          notes_en?: string | null;
          phone?: string | null;
          sort_order?: number;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "branches_brand_id_fkey";
            columns: ["brand_id"];
            isOneToOne: false;
            referencedRelation: "brands";
            referencedColumns: ["id"];
          },
        ];
      };
      brand_email_notifications: {
        Row: {
          brand_id: string;
          channel: string;
          created_at: string;
          error_message: string | null;
          event_type: string;
          id: string;
          order_id: string | null;
          provider: string | null;
          recipient: string | null;
          status: string;
        };
        Insert: {
          brand_id: string;
          channel: string;
          created_at?: string;
          error_message?: string | null;
          event_type: string;
          id?: string;
          order_id?: string | null;
          provider?: string | null;
          recipient?: string | null;
          status: string;
        };
        Update: {
          brand_id?: string;
          channel?: string;
          created_at?: string;
          error_message?: string | null;
          event_type?: string;
          id?: string;
          order_id?: string | null;
          provider?: string | null;
          recipient?: string | null;
          status?: string;
        };
        Relationships: [
          {
            foreignKeyName: "brand_email_notifications_brand_id_fkey";
            columns: ["brand_id"];
            isOneToOne: false;
            referencedRelation: "brands";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "brand_email_notifications_order_id_fkey";
            columns: ["order_id"];
            isOneToOne: false;
            referencedRelation: "orders";
            referencedColumns: ["id"];
          },
        ];
      };
      brand_notification_recipients: {
        Row: {
          active: boolean;
          brand_id: string;
          created_at: string;
          email: string;
          id: string;
          name: string | null;
          receive_benefit_payment_approved: boolean;
          receive_benefit_payment_rejected: boolean;
          receive_order_cancelled: boolean;
          receive_order_delivered: boolean;
          receive_order_placed: boolean;
          updated_at: string;
        };
        Insert: {
          active?: boolean;
          brand_id: string;
          created_at?: string;
          email: string;
          id?: string;
          name?: string | null;
          receive_benefit_payment_approved?: boolean;
          receive_benefit_payment_rejected?: boolean;
          receive_order_cancelled?: boolean;
          receive_order_delivered?: boolean;
          receive_order_placed?: boolean;
          updated_at?: string;
        };
        Update: {
          active?: boolean;
          brand_id?: string;
          created_at?: string;
          email?: string;
          id?: string;
          name?: string | null;
          receive_benefit_payment_approved?: boolean;
          receive_benefit_payment_rejected?: boolean;
          receive_order_cancelled?: boolean;
          receive_order_delivered?: boolean;
          receive_order_placed?: boolean;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "brand_notification_recipients_brand_id_fkey";
            columns: ["brand_id"];
            isOneToOne: false;
            referencedRelation: "brands";
            referencedColumns: ["id"];
          },
        ];
      };
      brand_tracking_settings: {
        Row: {
          brand_id: string;
          consent_required: boolean;
          google_analytics_enabled: boolean;
          google_analytics_id: string | null;
          meta_pixel_enabled: boolean;
          meta_pixel_id: string | null;
          updated_at: string;
        };
        Insert: {
          brand_id: string;
          consent_required?: boolean;
          google_analytics_enabled?: boolean;
          google_analytics_id?: string | null;
          meta_pixel_enabled?: boolean;
          meta_pixel_id?: string | null;
          updated_at?: string;
        };
        Update: {
          brand_id?: string;
          consent_required?: boolean;
          google_analytics_enabled?: boolean;
          google_analytics_id?: string | null;
          meta_pixel_enabled?: boolean;
          meta_pixel_id?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "brand_tracking_settings_brand_id_fkey";
            columns: ["brand_id"];
            isOneToOne: true;
            referencedRelation: "brands";
            referencedColumns: ["id"];
          },
        ];
      };
      brands: {
        Row: {
          about_ar: string | null;
          about_en: string | null;
          business_type: string | null;
          created_at: string;
          created_by: string | null;
          custom_domain: string | null;
          hero_media: Json;
          id: string;
          is_active: boolean;
          logo_url: string | null;
          meta_description: string | null;
          meta_title: string | null;
          name_ar: string | null;
          name_en: string;
          payment_receipt_uploaded_at: string | null;
          payment_receipt_url: string | null;
          plan_type: string;
          primary_color: string | null;
          slug: string;
          subscription_expires_at: string | null;
          subscription_status: string | null;
          subscription_tier: string | null;
          support_access_enabled: boolean;
          trial_ends_at: string | null;
          updated_at: string;
        };
        Insert: {
          about_ar?: string | null;
          about_en?: string | null;
          business_type?: string | null;
          created_at?: string;
          created_by?: string | null;
          custom_domain?: string | null;
          hero_media?: Json;
          id?: string;
          is_active?: boolean;
          logo_url?: string | null;
          meta_description?: string | null;
          meta_title?: string | null;
          name_ar?: string | null;
          name_en: string;
          payment_receipt_uploaded_at?: string | null;
          payment_receipt_url?: string | null;
          plan_type?: string;
          primary_color?: string | null;
          slug: string;
          subscription_expires_at?: string | null;
          subscription_status?: string | null;
          subscription_tier?: string | null;
          support_access_enabled?: boolean;
          trial_ends_at?: string | null;
          updated_at?: string;
        };
        Update: {
          about_ar?: string | null;
          about_en?: string | null;
          business_type?: string | null;
          created_at?: string;
          created_by?: string | null;
          custom_domain?: string | null;
          hero_media?: Json;
          id?: string;
          is_active?: boolean;
          logo_url?: string | null;
          meta_description?: string | null;
          meta_title?: string | null;
          name_ar?: string | null;
          name_en?: string;
          payment_receipt_uploaded_at?: string | null;
          payment_receipt_url?: string | null;
          plan_type?: string;
          primary_color?: string | null;
          slug?: string;
          subscription_expires_at?: string | null;
          subscription_status?: string | null;
          subscription_tier?: string | null;
          support_access_enabled?: boolean;
          trial_ends_at?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      business_settings: {
        Row: {
          address: string | null;
          announcement_audience: string;
          announcement_bg: string;
          announcement_bold: boolean;
          announcement_dismissible: boolean;
          announcement_enabled: boolean;
          announcement_fg: string;
          announcement_italic: boolean;
          announcement_scope: string;
          announcement_text_ar: string | null;
          announcement_text_en: string | null;
          background_color: string;
          benefit_account_number: string | null;
          benefit_enabled: boolean;
          benefit_processing_fee: number;
          benefit_qr_url: string | null;
          best_sellers_title_ar: string | null;
          best_sellers_title_en: string | null;
          brand_id: string;
          btn_checkout_bg: string | null;
          btn_checkout_fg: string | null;
          btn_primary_bg: string | null;
          btn_primary_fg: string | null;
          btn_secondary_bg: string | null;
          btn_secondary_fg: string | null;
          business_name: string;
          card_enabled: boolean;
          card_processing_fee: number;
          card_public_key: string | null;
          card_secret_key: string | null;
          cart_drawer_checkout_bg: string | null;
          cart_drawer_checkout_fg: string | null;
          cod_enabled: boolean;
          courier_out_for_delivery_message_ar: string | null;
          courier_out_for_delivery_message_en: string | null;
          created_at: string;
          currency: string;
          default_tax_rate: number;
          delivery_enabled: boolean;
          delivery_fee: number;
          digital_delivery_enabled: boolean;
          email: string | null;
          email_footer_ar: string | null;
          email_footer_en: string | null;
          email_intro_ar: string | null;
          email_intro_en: string | null;
          email_sender_name: string | null;
          favicon_url: string | null;
          font_family: string;
          font_size: number;
          font_url: string | null;
          footer_bg: string | null;
          footer_fg: string | null;
          footer_note: string | null;
          global_sale_badges_enabled: boolean;
          header_bg: string | null;
          header_fg: string | null;
          heading_color: string | null;
          hero_title_align: string;
          hero_title_ar: string | null;
          hero_title_color: string | null;
          hero_title_en: string | null;
          hero_title_size: number;
          home_promo_cards: Json;
          invoice_secondary_color: string | null;
          invoice_show_business_details: boolean;
          invoice_show_customer_contact: boolean;
          invoice_show_fulfillment: boolean;
          invoice_show_notes: boolean;
          invoice_template: string;
          invoice_title_ar: string | null;
          invoice_title_en: string | null;
          link_color: string | null;
          logo_align: string;
          logo_height: number;
          logo_size: number;
          logo_url: string | null;
          logo_width: number;
          logo_x: number;
          logo_y: number;
          menu_bg: string | null;
          menu_fg: string | null;
          menu_show_account: boolean;
          menu_show_home: boolean;
          menu_show_orders: boolean;
          menu_show_pages: boolean;
          menu_title_ar: string | null;
          menu_title_en: string | null;
          new_arrivals_title_ar: string | null;
          new_arrivals_title_en: string | null;
          next_invoice_number: number;
          pages: Json;
          phone: string | null;
          pickup_enabled: boolean;
          primary_color: string;
          shipping_zones: Json;
          show_best_sellers: boolean;
          show_footer_name: boolean;
          show_header_name: boolean;
          show_hero_about: boolean;
          show_hero_title: boolean;
          show_new_arrivals: boolean;
          socials: Json;
          storefront_accent_color: string | null;
          storefront_background_color: string | null;
          storefront_font_ar: string;
          storefront_font_ar_url: string | null;
          storefront_font_en: string;
          storefront_font_en_url: string | null;
          storefront_text_color: string | null;
          text_color: string;
          updated_at: string;
          user_id: string;
          vat_inclusive: boolean;
          vat_number: string | null;
          whatsapp_enabled: boolean;
          whatsapp_number: string | null;
        };
        Insert: {
          address?: string | null;
          announcement_audience?: string;
          announcement_bg?: string;
          announcement_bold?: boolean;
          announcement_dismissible?: boolean;
          announcement_enabled?: boolean;
          announcement_fg?: string;
          announcement_italic?: boolean;
          announcement_scope?: string;
          announcement_text_ar?: string | null;
          announcement_text_en?: string | null;
          background_color?: string;
          benefit_account_number?: string | null;
          benefit_enabled?: boolean;
          benefit_processing_fee?: number;
          benefit_qr_url?: string | null;
          best_sellers_title_ar?: string | null;
          best_sellers_title_en?: string | null;
          brand_id: string;
          btn_checkout_bg?: string | null;
          btn_checkout_fg?: string | null;
          btn_primary_bg?: string | null;
          btn_primary_fg?: string | null;
          btn_secondary_bg?: string | null;
          btn_secondary_fg?: string | null;
          business_name?: string;
          card_enabled?: boolean;
          card_processing_fee?: number;
          card_public_key?: string | null;
          card_secret_key?: string | null;
          cart_drawer_checkout_bg?: string | null;
          cart_drawer_checkout_fg?: string | null;
          cod_enabled?: boolean;
          courier_out_for_delivery_message_ar?: string | null;
          courier_out_for_delivery_message_en?: string | null;
          created_at?: string;
          currency?: string;
          default_tax_rate?: number;
          delivery_enabled?: boolean;
          delivery_fee?: number;
          digital_delivery_enabled?: boolean;
          email?: string | null;
          email_footer_ar?: string | null;
          email_footer_en?: string | null;
          email_intro_ar?: string | null;
          email_intro_en?: string | null;
          email_sender_name?: string | null;
          favicon_url?: string | null;
          font_family?: string;
          font_size?: number;
          font_url?: string | null;
          footer_bg?: string | null;
          footer_fg?: string | null;
          footer_note?: string | null;
          global_sale_badges_enabled?: boolean;
          header_bg?: string | null;
          header_fg?: string | null;
          heading_color?: string | null;
          hero_title_align?: string;
          hero_title_ar?: string | null;
          hero_title_color?: string | null;
          hero_title_en?: string | null;
          hero_title_size?: number;
          home_promo_cards?: Json;
          invoice_secondary_color?: string | null;
          invoice_show_business_details?: boolean;
          invoice_show_customer_contact?: boolean;
          invoice_show_fulfillment?: boolean;
          invoice_show_notes?: boolean;
          invoice_template?: string;
          invoice_title_ar?: string | null;
          invoice_title_en?: string | null;
          link_color?: string | null;
          logo_align?: string;
          logo_height?: number;
          logo_size?: number;
          logo_url?: string | null;
          logo_width?: number;
          logo_x?: number;
          logo_y?: number;
          menu_bg?: string | null;
          menu_fg?: string | null;
          menu_show_account?: boolean;
          menu_show_home?: boolean;
          menu_show_orders?: boolean;
          menu_show_pages?: boolean;
          menu_title_ar?: string | null;
          menu_title_en?: string | null;
          new_arrivals_title_ar?: string | null;
          new_arrivals_title_en?: string | null;
          next_invoice_number?: number;
          pages?: Json;
          phone?: string | null;
          pickup_enabled?: boolean;
          primary_color?: string;
          shipping_zones?: Json;
          show_best_sellers?: boolean;
          show_footer_name?: boolean;
          show_header_name?: boolean;
          show_hero_about?: boolean;
          show_hero_title?: boolean;
          show_new_arrivals?: boolean;
          socials?: Json;
          storefront_accent_color?: string | null;
          storefront_background_color?: string | null;
          storefront_font_ar?: string;
          storefront_font_ar_url?: string | null;
          storefront_font_en?: string;
          storefront_font_en_url?: string | null;
          storefront_text_color?: string | null;
          text_color?: string;
          updated_at?: string;
          user_id: string;
          vat_inclusive?: boolean;
          vat_number?: string | null;
          whatsapp_enabled?: boolean;
          whatsapp_number?: string | null;
        };
        Update: {
          address?: string | null;
          announcement_audience?: string;
          announcement_bg?: string;
          announcement_bold?: boolean;
          announcement_dismissible?: boolean;
          announcement_enabled?: boolean;
          announcement_fg?: string;
          announcement_italic?: boolean;
          announcement_scope?: string;
          announcement_text_ar?: string | null;
          announcement_text_en?: string | null;
          background_color?: string;
          benefit_account_number?: string | null;
          benefit_enabled?: boolean;
          benefit_processing_fee?: number;
          benefit_qr_url?: string | null;
          best_sellers_title_ar?: string | null;
          best_sellers_title_en?: string | null;
          brand_id?: string;
          btn_checkout_bg?: string | null;
          btn_checkout_fg?: string | null;
          btn_primary_bg?: string | null;
          btn_primary_fg?: string | null;
          btn_secondary_bg?: string | null;
          btn_secondary_fg?: string | null;
          business_name?: string;
          card_enabled?: boolean;
          card_processing_fee?: number;
          card_public_key?: string | null;
          card_secret_key?: string | null;
          cart_drawer_checkout_bg?: string | null;
          cart_drawer_checkout_fg?: string | null;
          cod_enabled?: boolean;
          courier_out_for_delivery_message_ar?: string | null;
          courier_out_for_delivery_message_en?: string | null;
          created_at?: string;
          currency?: string;
          default_tax_rate?: number;
          delivery_enabled?: boolean;
          delivery_fee?: number;
          digital_delivery_enabled?: boolean;
          email?: string | null;
          email_footer_ar?: string | null;
          email_footer_en?: string | null;
          email_intro_ar?: string | null;
          email_intro_en?: string | null;
          email_sender_name?: string | null;
          favicon_url?: string | null;
          font_family?: string;
          font_size?: number;
          font_url?: string | null;
          footer_bg?: string | null;
          footer_fg?: string | null;
          footer_note?: string | null;
          global_sale_badges_enabled?: boolean;
          header_bg?: string | null;
          header_fg?: string | null;
          heading_color?: string | null;
          hero_title_align?: string;
          hero_title_ar?: string | null;
          hero_title_color?: string | null;
          hero_title_en?: string | null;
          hero_title_size?: number;
          home_promo_cards?: Json;
          invoice_secondary_color?: string | null;
          invoice_show_business_details?: boolean;
          invoice_show_customer_contact?: boolean;
          invoice_show_fulfillment?: boolean;
          invoice_show_notes?: boolean;
          invoice_template?: string;
          invoice_title_ar?: string | null;
          invoice_title_en?: string | null;
          link_color?: string | null;
          logo_align?: string;
          logo_height?: number;
          logo_size?: number;
          logo_url?: string | null;
          logo_width?: number;
          logo_x?: number;
          logo_y?: number;
          menu_bg?: string | null;
          menu_fg?: string | null;
          menu_show_account?: boolean;
          menu_show_home?: boolean;
          menu_show_orders?: boolean;
          menu_show_pages?: boolean;
          menu_title_ar?: string | null;
          menu_title_en?: string | null;
          new_arrivals_title_ar?: string | null;
          new_arrivals_title_en?: string | null;
          next_invoice_number?: number;
          pages?: Json;
          phone?: string | null;
          pickup_enabled?: boolean;
          primary_color?: string;
          shipping_zones?: Json;
          show_best_sellers?: boolean;
          show_footer_name?: boolean;
          show_header_name?: boolean;
          show_hero_about?: boolean;
          show_hero_title?: boolean;
          show_new_arrivals?: boolean;
          socials?: Json;
          storefront_accent_color?: string | null;
          storefront_background_color?: string | null;
          storefront_font_ar?: string;
          storefront_font_ar_url?: string | null;
          storefront_font_en?: string;
          storefront_font_en_url?: string | null;
          storefront_text_color?: string | null;
          text_color?: string;
          updated_at?: string;
          user_id?: string;
          vat_inclusive?: boolean;
          vat_number?: string | null;
          whatsapp_enabled?: boolean;
          whatsapp_number?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "business_settings_brand_id_fkey";
            columns: ["brand_id"];
            isOneToOne: true;
            referencedRelation: "brands";
            referencedColumns: ["id"];
          },
        ];
      };
      categories: {
        Row: {
          brand_id: string;
          created_at: string;
          id: string;
          image_url: string | null;
          is_active: boolean;
          menu_icon_url: string | null;
          name_ar: string | null;
          name_en: string;
          parent_id: string | null;
          slug: string | null;
          sort_order: number;
          updated_at: string;
        };
        Insert: {
          brand_id: string;
          created_at?: string;
          id?: string;
          image_url?: string | null;
          is_active?: boolean;
          menu_icon_url?: string | null;
          name_ar?: string | null;
          name_en: string;
          parent_id?: string | null;
          slug?: string | null;
          sort_order?: number;
          updated_at?: string;
        };
        Update: {
          brand_id?: string;
          created_at?: string;
          id?: string;
          image_url?: string | null;
          is_active?: boolean;
          menu_icon_url?: string | null;
          name_ar?: string | null;
          name_en?: string;
          parent_id?: string | null;
          slug?: string | null;
          sort_order?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "categories_brand_id_fkey";
            columns: ["brand_id"];
            isOneToOne: false;
            referencedRelation: "brands";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "categories_parent_id_fkey";
            columns: ["parent_id"];
            isOneToOne: false;
            referencedRelation: "categories";
            referencedColumns: ["id"];
          },
        ];
      };
      customer_addresses: {
        Row: {
          block: string | null;
          brand_id: string;
          created_at: string;
          customer_id: string;
          delivery_notes: string | null;
          flat: string | null;
          floor: string | null;
          formatted_address: string | null;
          house: string | null;
          id: string;
          is_default: boolean;
          label: string | null;
          landmark: string | null;
          latitude: number | null;
          longitude: number | null;
          place_id: string | null;
          region: string | null;
          road: string | null;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          block?: string | null;
          brand_id: string;
          created_at?: string;
          customer_id: string;
          delivery_notes?: string | null;
          flat?: string | null;
          floor?: string | null;
          formatted_address?: string | null;
          house?: string | null;
          id?: string;
          is_default?: boolean;
          label?: string | null;
          landmark?: string | null;
          latitude?: number | null;
          longitude?: number | null;
          place_id?: string | null;
          region?: string | null;
          road?: string | null;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          block?: string | null;
          brand_id?: string;
          created_at?: string;
          customer_id?: string;
          delivery_notes?: string | null;
          flat?: string | null;
          floor?: string | null;
          formatted_address?: string | null;
          house?: string | null;
          id?: string;
          is_default?: boolean;
          label?: string | null;
          landmark?: string | null;
          latitude?: number | null;
          longitude?: number | null;
          place_id?: string | null;
          region?: string | null;
          road?: string | null;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "customer_addresses_brand_id_fkey";
            columns: ["brand_id"];
            isOneToOne: false;
            referencedRelation: "brands";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "customer_addresses_customer_id_fkey";
            columns: ["customer_id"];
            isOneToOne: false;
            referencedRelation: "customers";
            referencedColumns: ["id"];
          },
        ];
      };
      customers: {
        Row: {
          address: string | null;
          auth_user_id: string | null;
          block: string | null;
          brand_id: string;
          city: string | null;
          created_at: string;
          email: string | null;
          flat: string | null;
          house: string | null;
          id: string;
          name: string;
          notes: string | null;
          phone: string | null;
          region: string | null;
          road: string | null;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          address?: string | null;
          auth_user_id?: string | null;
          block?: string | null;
          brand_id: string;
          city?: string | null;
          created_at?: string;
          email?: string | null;
          flat?: string | null;
          house?: string | null;
          id?: string;
          name: string;
          notes?: string | null;
          phone?: string | null;
          region?: string | null;
          road?: string | null;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          address?: string | null;
          auth_user_id?: string | null;
          block?: string | null;
          brand_id?: string;
          city?: string | null;
          created_at?: string;
          email?: string | null;
          flat?: string | null;
          house?: string | null;
          id?: string;
          name?: string;
          notes?: string | null;
          phone?: string | null;
          region?: string | null;
          road?: string | null;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "customers_brand_id_fkey";
            columns: ["brand_id"];
            isOneToOne: false;
            referencedRelation: "brands";
            referencedColumns: ["id"];
          },
        ];
      };
      customization_options: {
        Row: {
          brand_id: string;
          created_at: string;
          id: string;
          name: string;
          price_delta: number;
          user_id: string;
        };
        Insert: {
          brand_id: string;
          created_at?: string;
          id?: string;
          name: string;
          price_delta?: number;
          user_id: string;
        };
        Update: {
          brand_id?: string;
          created_at?: string;
          id?: string;
          name?: string;
          price_delta?: number;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "customization_options_brand_id_fkey";
            columns: ["brand_id"];
            isOneToOne: false;
            referencedRelation: "brands";
            referencedColumns: ["id"];
          },
        ];
      };
      expenses: {
        Row: {
          amount: number;
          brand_id: string;
          category: string;
          created_at: string;
          currency: string;
          description: string | null;
          expense_date: string;
          id: string;
          line_items: Json | null;
          notes: string | null;
          receipt_time: string | null;
          receipt_url: string | null;
          store_name: string | null;
          tax_amount: number | null;
          tax_rate: number | null;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          amount?: number;
          brand_id: string;
          category: string;
          created_at?: string;
          currency?: string;
          description?: string | null;
          expense_date?: string;
          id?: string;
          line_items?: Json | null;
          notes?: string | null;
          receipt_time?: string | null;
          receipt_url?: string | null;
          store_name?: string | null;
          tax_amount?: number | null;
          tax_rate?: number | null;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          amount?: number;
          brand_id?: string;
          category?: string;
          created_at?: string;
          currency?: string;
          description?: string | null;
          expense_date?: string;
          id?: string;
          line_items?: Json | null;
          notes?: string | null;
          receipt_time?: string | null;
          receipt_url?: string | null;
          store_name?: string | null;
          tax_amount?: number | null;
          tax_rate?: number | null;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "expenses_brand_id_fkey";
            columns: ["brand_id"];
            isOneToOne: false;
            referencedRelation: "brands";
            referencedColumns: ["id"];
          },
        ];
      };
      idempotency_claims: {
        Row: {
          brand_id: string;
          created_at: string;
          idempotency_key: string;
          order_id: string | null;
          request_hash: string;
        };
        Insert: {
          brand_id: string;
          created_at?: string;
          idempotency_key: string;
          order_id?: string | null;
          request_hash: string;
        };
        Update: {
          brand_id?: string;
          created_at?: string;
          idempotency_key?: string;
          order_id?: string | null;
          request_hash?: string;
        };
        Relationships: [
          {
            foreignKeyName: "idempotency_claims_brand_id_fkey";
            columns: ["brand_id"];
            isOneToOne: false;
            referencedRelation: "brands";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "idempotency_claims_order_id_fkey";
            columns: ["order_id"];
            isOneToOne: false;
            referencedRelation: "orders";
            referencedColumns: ["id"];
          },
        ];
      };
      integration_credentials: {
        Row: {
          api_key: string | null;
          base_url: string | null;
          brand_id: string;
          created_at: string;
          created_by: string | null;
          id: string;
          is_active: boolean;
          notes: string | null;
          provider: string;
          updated_at: string;
          webhook_secret: string | null;
        };
        Insert: {
          api_key?: string | null;
          base_url?: string | null;
          brand_id: string;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          is_active?: boolean;
          notes?: string | null;
          provider: string;
          updated_at?: string;
          webhook_secret?: string | null;
        };
        Update: {
          api_key?: string | null;
          base_url?: string | null;
          brand_id?: string;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          is_active?: boolean;
          notes?: string | null;
          provider?: string;
          updated_at?: string;
          webhook_secret?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "integration_credentials_brand_id_fkey";
            columns: ["brand_id"];
            isOneToOne: false;
            referencedRelation: "brands";
            referencedColumns: ["id"];
          },
        ];
      };
      message_templates: {
        Row: {
          body: string;
          brand_id: string;
          channel: string;
          created_at: string;
          id: string;
          is_default: boolean;
          name: string;
          subject: string | null;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          body: string;
          brand_id: string;
          channel?: string;
          created_at?: string;
          id?: string;
          is_default?: boolean;
          name: string;
          subject?: string | null;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          body?: string;
          brand_id?: string;
          channel?: string;
          created_at?: string;
          id?: string;
          is_default?: boolean;
          name?: string;
          subject?: string | null;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "message_templates_brand_id_fkey";
            columns: ["brand_id"];
            isOneToOne: false;
            referencedRelation: "brands";
            referencedColumns: ["id"];
          },
        ];
      };
      order_email_events: {
        Row: {
          attempts: number;
          brand_id: string;
          created_at: string;
          event_type: string;
          id: string;
          language: string;
          last_error: string | null;
          order_id: string;
          processed_at: string | null;
          status: string;
        };
        Insert: {
          attempts?: number;
          brand_id: string;
          created_at?: string;
          event_type: string;
          id?: string;
          language?: string;
          last_error?: string | null;
          order_id: string;
          processed_at?: string | null;
          status?: string;
        };
        Update: {
          attempts?: number;
          brand_id?: string;
          created_at?: string;
          event_type?: string;
          id?: string;
          language?: string;
          last_error?: string | null;
          order_id?: string;
          processed_at?: string | null;
          status?: string;
        };
        Relationships: [
          {
            foreignKeyName: "order_email_events_brand_id_fkey";
            columns: ["brand_id"];
            isOneToOne: false;
            referencedRelation: "brands";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "order_email_events_order_id_fkey";
            columns: ["order_id"];
            isOneToOne: false;
            referencedRelation: "orders";
            referencedColumns: ["id"];
          },
        ];
      };
      order_items: {
        Row: {
          brand_id: string;
          created_at: string;
          custom_field_values: Json;
          customization_total: number;
          customizations: Json;
          description: string;
          id: string;
          line_total: number;
          location: string;
          order_id: string;
          original_price: number | null;
          product_id: string | null;
          quantity: number;
          selected_variant: Json | null;
          unit_price: number;
          user_id: string;
          variant_id: string | null;
        };
        Insert: {
          brand_id: string;
          created_at?: string;
          custom_field_values?: Json;
          customization_total?: number;
          customizations?: Json;
          description: string;
          id?: string;
          line_total?: number;
          location?: string;
          order_id: string;
          original_price?: number | null;
          product_id?: string | null;
          quantity?: number;
          selected_variant?: Json | null;
          unit_price?: number;
          user_id: string;
          variant_id?: string | null;
        };
        Update: {
          brand_id?: string;
          created_at?: string;
          custom_field_values?: Json;
          customization_total?: number;
          customizations?: Json;
          description?: string;
          id?: string;
          line_total?: number;
          location?: string;
          order_id?: string;
          original_price?: number | null;
          product_id?: string | null;
          quantity?: number;
          selected_variant?: Json | null;
          unit_price?: number;
          user_id?: string;
          variant_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "order_items_brand_id_fkey";
            columns: ["brand_id"];
            isOneToOne: false;
            referencedRelation: "brands";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "order_items_order_id_fkey";
            columns: ["order_id"];
            isOneToOne: false;
            referencedRelation: "orders";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "order_items_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "order_items_variant_id_fkey";
            columns: ["variant_id"];
            isOneToOne: false;
            referencedRelation: "product_variants";
            referencedColumns: ["id"];
          },
        ];
      };
      orders: {
        Row: {
          advance_paid: number;
          assigned_at: string | null;
          assigned_by: string | null;
          assigned_to: string | null;
          benefit_receipt_delete_after: string | null;
          benefit_receipt_deleted_at: string | null;
          benefit_receipt_key: string | null;
          benefit_receipt_rejected_at: string | null;
          benefit_receipt_rejected_by: string | null;
          benefit_receipt_rejection_reason: string | null;
          benefit_receipt_uploaded_at: string | null;
          benefit_receipt_url: string | null;
          benefit_verified_at: string | null;
          benefit_verified_by: string | null;
          branch_id: string | null;
          brand_id: string;
          channel: string;
          cod_collected_amount: number | null;
          cod_collected_at: string | null;
          cod_collected_by: string | null;
          confirmation_email_error: string | null;
          confirmation_email_sent_at: string | null;
          confirmation_email_status: string | null;
          confirmation_email_token: string;
          courier_notified_at: string | null;
          created_at: string;
          currency: string;
          customer_email_snapshot: string | null;
          customer_id: string | null;
          customer_name_snapshot: string | null;
          customer_phone_snapshot: string | null;
          delivered_at: string | null;
          delivery_address_snapshot: Json | null;
          delivery_notes: string | null;
          delivery_status_updated_at: string | null;
          delivery_status_updated_by: string | null;
          digital_delivery_channel: string | null;
          digital_delivery_contact: string | null;
          discount: number;
          fulfillment_method: string;
          fulfillment_status: string;
          id: string;
          idempotency_key: string | null;
          invoice_number: number;
          notes: string | null;
          order_date: string;
          payment_gateway_reference: string | null;
          payment_method: string | null;
          payment_status: string;
          promo_code: string | null;
          promo_code_id: string | null;
          public_invoice_token: string;
          request_hash: string | null;
          shipping: number;
          shipping_address_id: string | null;
          status: string;
          stock_deducted: boolean;
          stock_snapshot: Json | null;
          subtotal: number;
          tax_amount: number;
          tax_rate: number;
          total: number;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          advance_paid?: number;
          assigned_at?: string | null;
          assigned_by?: string | null;
          assigned_to?: string | null;
          benefit_receipt_delete_after?: string | null;
          benefit_receipt_deleted_at?: string | null;
          benefit_receipt_key?: string | null;
          benefit_receipt_rejected_at?: string | null;
          benefit_receipt_rejected_by?: string | null;
          benefit_receipt_rejection_reason?: string | null;
          benefit_receipt_uploaded_at?: string | null;
          benefit_receipt_url?: string | null;
          benefit_verified_at?: string | null;
          benefit_verified_by?: string | null;
          branch_id?: string | null;
          brand_id: string;
          channel?: string;
          cod_collected_amount?: number | null;
          cod_collected_at?: string | null;
          cod_collected_by?: string | null;
          confirmation_email_error?: string | null;
          confirmation_email_sent_at?: string | null;
          confirmation_email_status?: string | null;
          confirmation_email_token?: string;
          courier_notified_at?: string | null;
          created_at?: string;
          currency?: string;
          customer_email_snapshot?: string | null;
          customer_id?: string | null;
          customer_name_snapshot?: string | null;
          customer_phone_snapshot?: string | null;
          delivered_at?: string | null;
          delivery_address_snapshot?: Json | null;
          delivery_notes?: string | null;
          delivery_status_updated_at?: string | null;
          delivery_status_updated_by?: string | null;
          digital_delivery_channel?: string | null;
          digital_delivery_contact?: string | null;
          discount?: number;
          fulfillment_method?: string;
          fulfillment_status?: string;
          id?: string;
          idempotency_key?: string | null;
          invoice_number: number;
          notes?: string | null;
          order_date?: string;
          payment_gateway_reference?: string | null;
          payment_method?: string | null;
          payment_status?: string;
          promo_code?: string | null;
          promo_code_id?: string | null;
          public_invoice_token?: string;
          request_hash?: string | null;
          shipping?: number;
          shipping_address_id?: string | null;
          status?: string;
          stock_deducted?: boolean;
          stock_snapshot?: Json | null;
          subtotal?: number;
          tax_amount?: number;
          tax_rate?: number;
          total?: number;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          advance_paid?: number;
          assigned_at?: string | null;
          assigned_by?: string | null;
          assigned_to?: string | null;
          benefit_receipt_delete_after?: string | null;
          benefit_receipt_deleted_at?: string | null;
          benefit_receipt_key?: string | null;
          benefit_receipt_rejected_at?: string | null;
          benefit_receipt_rejected_by?: string | null;
          benefit_receipt_rejection_reason?: string | null;
          benefit_receipt_uploaded_at?: string | null;
          benefit_receipt_url?: string | null;
          benefit_verified_at?: string | null;
          benefit_verified_by?: string | null;
          branch_id?: string | null;
          brand_id?: string;
          channel?: string;
          cod_collected_amount?: number | null;
          cod_collected_at?: string | null;
          cod_collected_by?: string | null;
          confirmation_email_error?: string | null;
          confirmation_email_sent_at?: string | null;
          confirmation_email_status?: string | null;
          confirmation_email_token?: string;
          courier_notified_at?: string | null;
          created_at?: string;
          currency?: string;
          customer_email_snapshot?: string | null;
          customer_id?: string | null;
          customer_name_snapshot?: string | null;
          customer_phone_snapshot?: string | null;
          delivered_at?: string | null;
          delivery_address_snapshot?: Json | null;
          delivery_notes?: string | null;
          delivery_status_updated_at?: string | null;
          delivery_status_updated_by?: string | null;
          digital_delivery_channel?: string | null;
          digital_delivery_contact?: string | null;
          discount?: number;
          fulfillment_method?: string;
          fulfillment_status?: string;
          id?: string;
          idempotency_key?: string | null;
          invoice_number?: number;
          notes?: string | null;
          order_date?: string;
          payment_gateway_reference?: string | null;
          payment_method?: string | null;
          payment_status?: string;
          promo_code?: string | null;
          promo_code_id?: string | null;
          public_invoice_token?: string;
          request_hash?: string | null;
          shipping?: number;
          shipping_address_id?: string | null;
          status?: string;
          stock_deducted?: boolean;
          stock_snapshot?: Json | null;
          subtotal?: number;
          tax_amount?: number;
          tax_rate?: number;
          total?: number;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "orders_assigned_by_fkey";
            columns: ["assigned_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "orders_assigned_to_fkey";
            columns: ["assigned_to"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "orders_branch_id_fkey";
            columns: ["branch_id"];
            isOneToOne: false;
            referencedRelation: "branches";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "orders_brand_id_fkey";
            columns: ["brand_id"];
            isOneToOne: false;
            referencedRelation: "brands";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "orders_cod_collected_by_fkey";
            columns: ["cod_collected_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "orders_customer_id_fkey";
            columns: ["customer_id"];
            isOneToOne: false;
            referencedRelation: "customers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "orders_delivery_status_updated_by_fkey";
            columns: ["delivery_status_updated_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "orders_promo_code_id_fkey";
            columns: ["promo_code_id"];
            isOneToOne: false;
            referencedRelation: "promo_codes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "orders_shipping_address_id_fkey";
            columns: ["shipping_address_id"];
            isOneToOne: false;
            referencedRelation: "customer_addresses";
            referencedColumns: ["id"];
          },
        ];
      };
      pending_benefit_receipts: {
        Row: {
          brand_id: string;
          consumed_at: string | null;
          content_type: string;
          created_at: string;
          expires_at: string;
          file_size: number;
          id: string;
          object_key: string;
          public_url: string | null;
          uploaded_at: string | null;
        };
        Insert: {
          brand_id: string;
          consumed_at?: string | null;
          content_type: string;
          created_at?: string;
          expires_at?: string;
          file_size: number;
          id?: string;
          object_key: string;
          public_url?: string | null;
          uploaded_at?: string | null;
        };
        Update: {
          brand_id?: string;
          consumed_at?: string | null;
          content_type?: string;
          created_at?: string;
          expires_at?: string;
          file_size?: number;
          id?: string;
          object_key?: string;
          public_url?: string | null;
          uploaded_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "pending_benefit_receipts_brand_id_fkey";
            columns: ["brand_id"];
            isOneToOne: false;
            referencedRelation: "brands";
            referencedColumns: ["id"];
          },
        ];
      };
      product_attribute_definitions: {
        Row: {
          brand_id: string;
          code: string;
          created_at: string;
          id: string;
          name_ar: string | null;
          name_en: string;
          type: string;
          updated_at: string;
        };
        Insert: {
          brand_id: string;
          code: string;
          created_at?: string;
          id?: string;
          name_ar?: string | null;
          name_en: string;
          type?: string;
          updated_at?: string;
        };
        Update: {
          brand_id?: string;
          code?: string;
          created_at?: string;
          id?: string;
          name_ar?: string | null;
          name_en?: string;
          type?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "product_attribute_definitions_brand_id_fkey";
            columns: ["brand_id"];
            isOneToOne: false;
            referencedRelation: "brands";
            referencedColumns: ["id"];
          },
        ];
      };
      product_engagement_daily: {
        Row: {
          brand_id: string;
          click_count: number;
          event_date: string;
          product_id: string;
          view_count: number;
        };
        Insert: {
          brand_id: string;
          click_count?: number;
          event_date?: string;
          product_id: string;
          view_count?: number;
        };
        Update: {
          brand_id?: string;
          click_count?: number;
          event_date?: string;
          product_id?: string;
          view_count?: number;
        };
        Relationships: [
          {
            foreignKeyName: "product_engagement_daily_brand_id_fkey";
            columns: ["brand_id"];
            isOneToOne: false;
            referencedRelation: "brands";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "product_engagement_daily_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
        ];
      };
      product_variant_attributes: {
        Row: {
          attribute_definition_id: string;
          created_at: string;
          id: string;
          updated_at: string;
          value_ar: string | null;
          value_en: string;
          variant_id: string;
        };
        Insert: {
          attribute_definition_id: string;
          created_at?: string;
          id?: string;
          updated_at?: string;
          value_ar?: string | null;
          value_en: string;
          variant_id: string;
        };
        Update: {
          attribute_definition_id?: string;
          created_at?: string;
          id?: string;
          updated_at?: string;
          value_ar?: string | null;
          value_en?: string;
          variant_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "product_variant_attributes_attribute_definition_id_fkey";
            columns: ["attribute_definition_id"];
            isOneToOne: false;
            referencedRelation: "product_attribute_definitions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "product_variant_attributes_variant_id_fkey";
            columns: ["variant_id"];
            isOneToOne: false;
            referencedRelation: "product_variants";
            referencedColumns: ["id"];
          },
        ];
      };
      product_variants: {
        Row: {
          barcode: string | null;
          brand_id: string;
          color: string | null;
          cost_price: number;
          created_at: string;
          fabric: string | null;
          id: string;
          image_url: string | null;
          option_five: string | null;
          option_four: string | null;
          original_price: number | null;
          product_id: string;
          selling_price: number;
          size: string | null;
          size_unit: string | null;
          sku: string | null;
          stock: number;
          stock_incubator: number;
          stock_main: number;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          barcode?: string | null;
          brand_id: string;
          color?: string | null;
          cost_price?: number;
          created_at?: string;
          fabric?: string | null;
          id?: string;
          image_url?: string | null;
          option_five?: string | null;
          option_four?: string | null;
          original_price?: number | null;
          product_id: string;
          selling_price?: number;
          size?: string | null;
          size_unit?: string | null;
          sku?: string | null;
          stock?: number;
          stock_incubator?: number;
          stock_main?: number;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          barcode?: string | null;
          brand_id?: string;
          color?: string | null;
          cost_price?: number;
          created_at?: string;
          fabric?: string | null;
          id?: string;
          image_url?: string | null;
          option_five?: string | null;
          option_four?: string | null;
          original_price?: number | null;
          product_id?: string;
          selling_price?: number;
          size?: string | null;
          size_unit?: string | null;
          sku?: string | null;
          stock?: number;
          stock_incubator?: number;
          stock_main?: number;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "product_variants_brand_id_fkey";
            columns: ["brand_id"];
            isOneToOne: false;
            referencedRelation: "brands";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "product_variants_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
        ];
      };
      products: {
        Row: {
          base_price: number | null;
          brand_id: string;
          category: string | null;
          created_at: string;
          custom_fields: Json;
          description: string | null;
          description_ar: string | null;
          description_en: string | null;
          featured_trending: boolean;
          id: string;
          image_url: string | null;
          is_active: boolean;
          media: Json;
          name: string;
          name_ar: string | null;
          name_en: string | null;
          show_sale_badge: boolean;
          tracks_inventory: boolean | null;
          updated_at: string;
          user_id: string;
          variant_label_color: string | null;
          variant_label_color_ar: string | null;
          variant_label_color_en: string | null;
          variant_label_fabric: string | null;
          variant_label_fabric_ar: string | null;
          variant_label_fabric_en: string | null;
          variant_label_five_ar: string | null;
          variant_label_five_en: string | null;
          variant_label_four_ar: string | null;
          variant_label_four_en: string | null;
          variant_label_size: string | null;
          variant_label_size_ar: string | null;
          variant_label_size_en: string | null;
        };
        Insert: {
          base_price?: number | null;
          brand_id: string;
          category?: string | null;
          created_at?: string;
          custom_fields?: Json;
          description?: string | null;
          description_ar?: string | null;
          description_en?: string | null;
          featured_trending?: boolean;
          id?: string;
          image_url?: string | null;
          is_active?: boolean;
          media?: Json;
          name: string;
          name_ar?: string | null;
          name_en?: string | null;
          show_sale_badge?: boolean;
          tracks_inventory?: boolean | null;
          updated_at?: string;
          user_id: string;
          variant_label_color?: string | null;
          variant_label_color_ar?: string | null;
          variant_label_color_en?: string | null;
          variant_label_fabric?: string | null;
          variant_label_fabric_ar?: string | null;
          variant_label_fabric_en?: string | null;
          variant_label_five_ar?: string | null;
          variant_label_five_en?: string | null;
          variant_label_four_ar?: string | null;
          variant_label_four_en?: string | null;
          variant_label_size?: string | null;
          variant_label_size_ar?: string | null;
          variant_label_size_en?: string | null;
        };
        Update: {
          base_price?: number | null;
          brand_id?: string;
          category?: string | null;
          created_at?: string;
          custom_fields?: Json;
          description?: string | null;
          description_ar?: string | null;
          description_en?: string | null;
          featured_trending?: boolean;
          id?: string;
          image_url?: string | null;
          is_active?: boolean;
          media?: Json;
          name?: string;
          name_ar?: string | null;
          name_en?: string | null;
          show_sale_badge?: boolean;
          tracks_inventory?: boolean | null;
          updated_at?: string;
          user_id?: string;
          variant_label_color?: string | null;
          variant_label_color_ar?: string | null;
          variant_label_color_en?: string | null;
          variant_label_fabric?: string | null;
          variant_label_fabric_ar?: string | null;
          variant_label_fabric_en?: string | null;
          variant_label_five_ar?: string | null;
          variant_label_five_en?: string | null;
          variant_label_four_ar?: string | null;
          variant_label_four_en?: string | null;
          variant_label_size?: string | null;
          variant_label_size_ar?: string | null;
          variant_label_size_en?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "products_brand_id_fkey";
            columns: ["brand_id"];
            isOneToOne: false;
            referencedRelation: "brands";
            referencedColumns: ["id"];
          },
        ];
      };
      profiles: {
        Row: {
          avatar_url: string | null;
          brand_id: string | null;
          created_at: string | null;
          email: string | null;
          full_name: string | null;
          id: string;
          name: string | null;
          permissions: Json | null;
          phone: string | null;
          role: string | null;
          status: string | null;
          updated_at: string | null;
        };
        Insert: {
          avatar_url?: string | null;
          brand_id?: string | null;
          created_at?: string | null;
          email?: string | null;
          full_name?: string | null;
          id: string;
          name?: string | null;
          permissions?: Json | null;
          phone?: string | null;
          role?: string | null;
          status?: string | null;
          updated_at?: string | null;
        };
        Update: {
          avatar_url?: string | null;
          brand_id?: string | null;
          created_at?: string | null;
          email?: string | null;
          full_name?: string | null;
          id?: string;
          name?: string | null;
          permissions?: Json | null;
          phone?: string | null;
          role?: string | null;
          status?: string | null;
          updated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "profiles_brand_id_fkey";
            columns: ["brand_id"];
            isOneToOne: false;
            referencedRelation: "brands";
            referencedColumns: ["id"];
          },
        ];
      };
      promo_codes: {
        Row: {
          brand_id: string;
          code: string;
          created_at: string;
          discount_type: string;
          discount_value: number;
          end_date: string | null;
          exclude_low_margin: boolean;
          exclude_sale_items: boolean;
          first_time_customers_only: boolean;
          id: string;
          is_active: boolean;
          margin_threshold: number;
          max_redemptions: number | null;
          maximum_discount_amount: number | null;
          minimum_order_amount: number | null;
          start_date: string | null;
          updated_at: string;
          usage_limit_per_customer: number | null;
        };
        Insert: {
          brand_id: string;
          code: string;
          created_at?: string;
          discount_type: string;
          discount_value: number;
          end_date?: string | null;
          exclude_low_margin?: boolean;
          exclude_sale_items?: boolean;
          first_time_customers_only?: boolean;
          id?: string;
          is_active?: boolean;
          margin_threshold?: number;
          max_redemptions?: number | null;
          maximum_discount_amount?: number | null;
          minimum_order_amount?: number | null;
          start_date?: string | null;
          updated_at?: string;
          usage_limit_per_customer?: number | null;
        };
        Update: {
          brand_id?: string;
          code?: string;
          created_at?: string;
          discount_type?: string;
          discount_value?: number;
          end_date?: string | null;
          exclude_low_margin?: boolean;
          exclude_sale_items?: boolean;
          first_time_customers_only?: boolean;
          id?: string;
          is_active?: boolean;
          margin_threshold?: number;
          max_redemptions?: number | null;
          maximum_discount_amount?: number | null;
          minimum_order_amount?: number | null;
          start_date?: string | null;
          updated_at?: string;
          usage_limit_per_customer?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "promo_codes_brand_id_fkey";
            columns: ["brand_id"];
            isOneToOne: false;
            referencedRelation: "brands";
            referencedColumns: ["id"];
          },
        ];
      };
      system_audit_logs: {
        Row: {
          action_type: string;
          created_at: string;
          id: string;
          operator_id: string;
          reason: string | null;
          target_tenant_id: string;
        };
        Insert: {
          action_type: string;
          created_at?: string;
          id?: string;
          operator_id: string;
          reason?: string | null;
          target_tenant_id: string;
        };
        Update: {
          action_type?: string;
          created_at?: string;
          id?: string;
          operator_id?: string;
          reason?: string | null;
          target_tenant_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "system_audit_logs_operator_id_fkey";
            columns: ["operator_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "system_audit_logs_target_tenant_id_fkey";
            columns: ["target_tenant_id"];
            isOneToOne: false;
            referencedRelation: "brands";
            referencedColumns: ["id"];
          },
        ];
      };
      system_settings: {
        Row: {
          base_price_bhd: number;
          benefit_pay_qr_url: string | null;
          discount_price_bhd: number | null;
          id: number;
          merchant_account_name: string;
          platform_icon_url: string | null;
          superadmin_impersonation_mutation_allowed: boolean;
          updated_at: string;
          whatsapp_support_number: string;
        };
        Insert: {
          base_price_bhd?: number;
          benefit_pay_qr_url?: string | null;
          discount_price_bhd?: number | null;
          id?: number;
          merchant_account_name?: string;
          platform_icon_url?: string | null;
          superadmin_impersonation_mutation_allowed?: boolean;
          updated_at?: string;
          whatsapp_support_number?: string;
        };
        Update: {
          base_price_bhd?: number;
          benefit_pay_qr_url?: string | null;
          discount_price_bhd?: number | null;
          id?: number;
          merchant_account_name?: string;
          platform_icon_url?: string | null;
          superadmin_impersonation_mutation_allowed?: boolean;
          updated_at?: string;
          whatsapp_support_number?: string;
        };
        Relationships: [];
      };
      tenant_requests: {
        Row: {
          benefit_receipt_url: string | null;
          business_type: string | null;
          contact_number: string;
          created_at: string;
          desired_subdomain: string;
          email: string;
          full_name: string;
          id: string;
          payment_verified: boolean;
          request_type: string;
          status: string;
          updated_at: string;
        };
        Insert: {
          benefit_receipt_url?: string | null;
          business_type?: string | null;
          contact_number: string;
          created_at?: string;
          desired_subdomain: string;
          email: string;
          full_name: string;
          id?: string;
          payment_verified?: boolean;
          request_type: string;
          status?: string;
          updated_at?: string;
        };
        Update: {
          benefit_receipt_url?: string | null;
          business_type?: string | null;
          contact_number?: string;
          created_at?: string;
          desired_subdomain?: string;
          email?: string;
          full_name?: string;
          id?: string;
          payment_verified?: boolean;
          request_type?: string;
          status?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      brand_public_settings: {
        Row: {
          announcement_audience: string | null;
          announcement_bg: string | null;
          announcement_bold: boolean | null;
          announcement_dismissible: boolean | null;
          announcement_enabled: boolean | null;
          announcement_fg: string | null;
          announcement_italic: boolean | null;
          announcement_scope: string | null;
          announcement_text_ar: string | null;
          announcement_text_en: string | null;
          background_color: string | null;
          benefit_enabled: boolean | null;
          benefit_qr_url: string | null;
          best_sellers_title_ar: string | null;
          best_sellers_title_en: string | null;
          brand_id: string | null;
          btn_checkout_bg: string | null;
          btn_checkout_fg: string | null;
          btn_primary_bg: string | null;
          btn_primary_fg: string | null;
          btn_secondary_bg: string | null;
          btn_secondary_fg: string | null;
          business_name: string | null;
          card_enabled: boolean | null;
          cart_drawer_checkout_bg: string | null;
          cart_drawer_checkout_fg: string | null;
          cod_enabled: boolean | null;
          currency: string | null;
          delivery_enabled: boolean | null;
          delivery_fee: number | null;
          digital_delivery_enabled: boolean | null;
          favicon_url: string | null;
          font_family: string | null;
          font_url: string | null;
          footer_bg: string | null;
          footer_fg: string | null;
          footer_note: string | null;
          global_sale_badges_enabled: boolean | null;
          header_bg: string | null;
          header_fg: string | null;
          heading_color: string | null;
          hero_title_align: string | null;
          hero_title_ar: string | null;
          hero_title_color: string | null;
          hero_title_en: string | null;
          hero_title_size: number | null;
          home_promo_cards: Json | null;
          link_color: string | null;
          logo_align: string | null;
          logo_size: number | null;
          logo_url: string | null;
          menu_bg: string | null;
          menu_fg: string | null;
          menu_show_account: boolean | null;
          menu_show_home: boolean | null;
          menu_show_orders: boolean | null;
          menu_show_pages: boolean | null;
          menu_title_ar: string | null;
          menu_title_en: string | null;
          new_arrivals_title_ar: string | null;
          new_arrivals_title_en: string | null;
          pages: Json | null;
          pickup_enabled: boolean | null;
          primary_color: string | null;
          show_best_sellers: boolean | null;
          show_footer_name: boolean | null;
          show_header_name: boolean | null;
          show_hero_about: boolean | null;
          show_hero_title: boolean | null;
          show_new_arrivals: boolean | null;
          socials: Json | null;
          storefront_accent_color: string | null;
          storefront_background_color: string | null;
          storefront_font_ar: string | null;
          storefront_font_ar_url: string | null;
          storefront_font_en: string | null;
          storefront_font_en_url: string | null;
          storefront_text_color: string | null;
          text_color: string | null;
          whatsapp_enabled: boolean | null;
          whatsapp_number: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "business_settings_brand_id_fkey";
            columns: ["brand_id"];
            isOneToOne: true;
            referencedRelation: "brands";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Functions: {
      activate_storefront_membership: {
        Args: { p_brand_slug: string; p_name?: string; p_phone?: string };
        Returns: Json;
      };
      approve_benefit_payment: { Args: { p_order_id: string }; Returns: Json };
      assign_order_courier: {
        Args: { p_courier_id: string; p_order_id: string };
        Returns: undefined;
      };
      can_access_brand: { Args: { _brand_id: string }; Returns: boolean };
      check_registered_customer_exists: {
        Args: { p_brand_id: string; p_email: string; p_phone: string };
        Returns: boolean;
      };
      consume_api_quota: {
        Args: { p_action: string; p_limit: number; p_window_minutes: number };
        Returns: boolean;
      };
      courier_can_read_address: {
        Args: { p_address_id: string; p_customer_id: string };
        Returns: boolean;
      };
      courier_can_read_customer: {
        Args: { p_customer_id: string };
        Returns: boolean;
      };
      courier_can_read_order: { Args: { p_order_id: string }; Returns: boolean };
      courier_complete_delivery: {
        Args: {
          p_collected_amount?: number;
          p_notes?: string;
          p_order_id: string;
        };
        Returns: Json;
      };
      courier_update_delivery:
        | {
            Args: {
              p_cod_collected: boolean;
              p_collected_amount?: number;
              p_courier_id: string;
              p_notes?: string;
              p_order_id: string;
            };
            Returns: Json;
          }
        | {
            Args: {
              p_cod_amount?: number;
              p_cod_collected?: boolean;
              p_notes?: string;
              p_order_id: string;
              p_status: string;
            };
            Returns: Json;
          };
      create_tenant_with_defaults:
        | {
            Args: {
              p_name_ar: string;
              p_name_en: string;
              p_owner_id: string;
              p_primary_color: string;
              p_slug: string;
            };
            Returns: string;
          }
        | {
            Args: {
              p_business_type?: string;
              p_name_ar: string;
              p_name_en: string;
              p_owner_id: string;
              p_primary_color: string;
              p_slug: string;
            };
            Returns: string;
          }
        | {
            Args: {
              p_name_ar: string;
              p_name_en: string;
              p_owner_email: string;
              p_owner_id: string;
              p_owner_name: string;
              p_primary_color: string;
              p_slug: string;
            };
            Returns: string;
          };
      current_brand_id: { Args: never; Returns: string };
      delete_brand: {
        Args: { p_brand_id: string; p_hard?: boolean };
        Returns: Json;
      };
      delete_category: { Args: { p_id: string }; Returns: Json };
      delete_integration_credential: {
        Args: { p_brand_id: string; p_id: string };
        Returns: boolean;
      };
      dispatch_order_email_event: {
        Args: { p_event_id: string };
        Returns: undefined;
      };
      enqueue_order_email_event: {
        Args: { p_brand_id: string; p_event_type: string; p_order_id: string };
        Returns: undefined;
      };
      get_courier_delivery_message: {
        Args: { p_order_id: string };
        Returns: Json;
      };
      get_gemini_credential: {
        Args: { p_brand_id: string };
        Returns: {
          api_key: string;
          base_url: string;
        }[];
      };
      get_onboarding_active_price: { Args: never; Returns: string };
      get_public_benefit_settings: {
        Args: { p_brand_id: string };
        Returns: {
          benefit_account_number: string;
        }[];
      };
      get_public_branches: {
        Args: { p_brand_id: string };
        Returns: {
          id: string;
          location_ar: string;
          location_en: string;
          name_ar: string;
          name_en: string;
          notes_ar: string;
          notes_en: string;
        }[];
      };
      get_storefront_best_sellers: {
        Args: { p_brand_slug: string; p_limit?: number };
        Returns: {
          product_id: string;
          units_sold: number;
        }[];
      };
      get_storefront_trending: {
        Args: { p_brand_slug: string; p_limit?: number };
        Returns: {
          engagement_score: number;
          manually_featured: boolean;
          product_id: string;
        }[];
      };
      has_permission: { Args: { p_permission: string }; Returns: boolean };
      has_storefront_membership: {
        Args: { p_brand_slug: string };
        Returns: boolean;
      };
      is_active: { Args: never; Returns: boolean };
      is_admin: { Args: never; Returns: boolean };
      is_brand_admin: { Args: never; Returns: boolean };
      is_super_admin: { Args: never; Returns: boolean };
      link_storefront_customer: {
        Args: { p_brand_slug: string; p_name?: string; p_phone?: string };
        Returns: Json;
      };
      list_brand_email_notifications: {
        Args: { p_brand_id: string; p_limit?: number; p_offset?: number };
        Returns: {
          channel: string;
          created_at: string;
          error_message: string;
          event_type: string;
          id: string;
          invoice_number: number;
          order_id: string;
          provider: string;
          recipient: string;
          status: string;
        }[];
      };
      list_integration_credentials: {
        Args: { p_brand_id: string };
        Returns: {
          api_key_masked: string;
          base_url: string;
          brand_id: string;
          has_api_key: boolean;
          has_webhook_secret: boolean;
          id: string;
          is_active: boolean;
          notes: string;
          provider: string;
          updated_at: string;
          webhook_secret_masked: string;
        }[];
      };
      normalize_customer_email: { Args: { p_value: string }; Returns: string };
      normalize_customer_phone: { Args: { p_value: string }; Returns: string };
      place_storefront_order:
        | {
            Args: {
              p_brand_slug: string;
              p_customer: Json;
              p_items: Json;
              p_notes?: string;
              p_payment_method: string;
            };
            Returns: Json;
          }
        | {
            Args: {
              p_branch_id?: string;
              p_brand_slug: string;
              p_customer: Json;
              p_fulfillment?: string;
              p_items: Json;
              p_notes?: string;
              p_payment_method: string;
            };
            Returns: Json;
          }
        | {
            Args: {
              p_branch_id?: string;
              p_brand_slug: string;
              p_customer: Json;
              p_digital_channel?: string;
              p_digital_contact?: string;
              p_fulfillment?: string;
              p_items: Json;
              p_notes?: string;
              p_payment_method: string;
              p_promo_code?: string;
            };
            Returns: Json;
          }
        | {
            Args: {
              p_benefit_receipt_id?: string;
              p_branch_id?: string;
              p_brand_slug: string;
              p_customer: Json;
              p_digital_channel?: string;
              p_digital_contact?: string;
              p_fulfillment?: string;
              p_items: Json;
              p_notes?: string;
              p_payment_method: string;
              p_promo_code?: string;
            };
            Returns: Json;
          }
        | {
            Args: {
              p_benefit_receipt_id?: string;
              p_branch_id?: string;
              p_brand_slug: string;
              p_customer: Json;
              p_digital_channel?: string;
              p_digital_contact?: string;
              p_fulfillment?: string;
              p_idempotency_key?: string;
              p_items: Json;
              p_notes?: string;
              p_payment_method: string;
              p_promo_code?: string;
              p_shipping_fee?: number;
              p_shipping_zone?: string;
            };
            Returns: Json;
          };
      place_storefront_order_core: {
        Args: {
          p_branch_id?: string;
          p_brand_slug: string;
          p_customer: Json;
          p_digital_channel?: string;
          p_digital_contact?: string;
          p_fulfillment?: string;
          p_items: Json;
          p_notes?: string;
          p_payment_method: string;
          p_promo_code?: string;
        };
        Returns: Json;
      };
      place_storefront_order_internal_20260710: {
        Args: {
          p_branch_id?: string;
          p_brand_slug: string;
          p_customer: Json;
          p_fulfillment?: string;
          p_items: Json;
          p_notes?: string;
          p_payment_method: string;
        };
        Returns: Json;
      };
      record_storefront_product_engagement: {
        Args: { p_brand_slug: string; p_event?: string; p_product_id: string };
        Returns: undefined;
      };
      reject_benefit_payment:
        | { Args: { p_order_id: string }; Returns: Json }
        | { Args: { p_order_id: string; p_reason: string }; Returns: Json };
      save_integration_credential: {
        Args: {
          p_api_key: string;
          p_base_url: string;
          p_brand_id: string;
          p_id: string;
          p_is_active: boolean;
          p_notes: string;
          p_provider: string;
          p_webhook_secret: string;
        };
        Returns: string;
      };
      show_limit: { Args: never; Returns: number };
      show_trgm: { Args: { "": string }; Returns: string[] };
      storefront_user_owns_customer: {
        Args: { p_customer_id: string };
        Returns: boolean;
      };
      storefront_user_owns_order: {
        Args: { p_order_id: string };
        Returns: boolean;
      };
      sync_order_stock: { Args: { p_order_id: string }; Returns: undefined };
      validate_promo_code: {
        Args: {
          p_brand_slug: string;
          p_code: string;
          p_customer_id?: string;
          p_items?: Json;
          p_subtotal: number;
        };
        Returns: Json;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema["CompositeTypes"] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {},
  },
} as const;
