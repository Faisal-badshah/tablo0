import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const j = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return j({ error: "Unauthorized" }, 401);

    const callerClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: { user: caller } } = await callerClient.auth.getUser();
    if (!caller) return j({ error: "Unauthorized" }, 401);

    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const { data: callerRole } = await adminClient.from("user_roles")
      .select("role, restaurant_id").eq("user_id", caller.id).eq("role", "owner").maybeSingle();
    if (!callerRole) return j({ error: "Only owners can manage staff" }, 403);

    const body = await req.json();
    const { action } = body;

    if (action === "create") {
      const { email, password, role, display_name } = body;
      if (!email || !password || !role || !["kitchen", "billing"].includes(role)) return j({ error: "Invalid input" }, 400);
      const { data: newUser, error: createError } = await adminClient.auth.admin.createUser({ email, password, email_confirm: true });
      if (createError) return j({ error: createError.message }, 400);
      await adminClient.from("user_roles").insert({
        user_id: newUser.user.id, role, restaurant_id: callerRole.restaurant_id,
        display_name: display_name || null,
      });
      return j({ success: true, user_id: newUser.user.id });
    }

    if (action === "list") {
      const { data: roles } = await adminClient.from("user_roles").select("*").eq("restaurant_id", callerRole.restaurant_id);
      if (!roles) return j({ staff: [] });
      const staffList: any[] = [];
      for (const r of roles) {
        const { data: { user } } = await adminClient.auth.admin.getUserById(r.user_id);
        if (user) staffList.push({ id: r.id, user_id: r.user_id, email: user.email, role: r.role, display_name: r.display_name || null });
      }
      return j({ staff: staffList });
    }

    if (action === "update_role") {
      const { user_id, role } = body;
      if (!user_id || !["kitchen", "billing"].includes(role)) return j({ error: "Invalid input" }, 400);
      const { data: t } = await adminClient.from("user_roles").select("restaurant_id, role").eq("user_id", user_id)
        .eq("restaurant_id", callerRole.restaurant_id).maybeSingle();
      if (!t) return j({ error: "Not found" }, 404);
      if (t.role === "owner") return j({ error: "Cannot change owner role" }, 400);
      await adminClient.from("user_roles").update({ role }).eq("user_id", user_id).eq("restaurant_id", callerRole.restaurant_id);
      return j({ success: true });
    }

    if (action === "update_name") {
      const { user_id, display_name } = body;
      if (!user_id) return j({ error: "Invalid input" }, 400);
      await adminClient.from("user_roles").update({ display_name: display_name || null })
        .eq("user_id", user_id).eq("restaurant_id", callerRole.restaurant_id);
      return j({ success: true });
    }

    if (action === "delete") {
      const { user_id } = body;
      if (!user_id || user_id === caller.id) return j({ error: "Cannot delete yourself" }, 400);
      const { data: targetRole } = await adminClient.from("user_roles").select("restaurant_id, role")
        .eq("user_id", user_id).eq("restaurant_id", callerRole.restaurant_id).maybeSingle();
      if (!targetRole) return j({ error: "Staff not found" }, 404);
      if (targetRole.role === "owner") return j({ error: "Cannot delete owner" }, 400);
      await adminClient.from("user_roles").delete().eq("user_id", user_id);
      await adminClient.auth.admin.deleteUser(user_id);
      return j({ success: true });
    }

    return j({ error: "Invalid action" }, 400);
  } catch (err) {
    return j({ error: (err as Error).message }, 500);
  }
});
