import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { resend } from "@/lib/resend";
import { enqueueWelcomeEmail } from "@/lib/emailOutbox";
import { syncContact } from "@/lib/activecampaign";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { claimGuestTickets } from "@/lib/ticketClaim";
import { jamPathById } from "@/lib/shortRef";

export async function GET(request: Request) {
  const { searchParams, origin: requestOrigin } = new URL(request.url);
  const origin = process.env.NEXT_PUBLIC_SITE_URL ?? requestOrigin;
  const code = searchParams.get("code");
  const inviteToken = searchParams.get("invite");
  const rawNext = searchParams.get("next") ?? "";
  const next = /^\/[^/]/.test(rawNext) ? rawNext : null;

  if (code) {
    const cookieStore = await cookies();

    // Build the redirect response first so we can set cookies directly on it.
    // This is required in production — cookies set via cookieStore.set() are not
    // reliably forwarded when a separate NextResponse.redirect() is returned.
    const tempRedirect = NextResponse.redirect(`${origin}/account`);

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) => {
              tempRedirect.cookies.set(name, value, options);
            });
          },
        },
      }
    );

    const { data: sessionData, error } = await supabase.auth.exchangeCodeForSession(code);

    if (error) {
      return NextResponse.redirect(
        `${origin}/auth?error=${encodeURIComponent(error.message)}`
      );
    }

    // Determine where to send the user
    let destination: string | null = null;
    if (sessionData?.user) {
      const user = sessionData.user;
      const { data: profile } = await supabase
        .from("profiles")
        .select("username, display_name")
        .eq("id", user.id)
        .single();

      // Not limited to first login: someone can buy as a guest in a private
      // window and only sign in afterwards, or already have an account and
      // check out as a guest anyway. Claiming on every sign-in catches both,
      // and is a no-op once there is nothing left unclaimed.
      if (user.email) {
        await claimGuestTickets(supabaseAdmin(), user.id, user.email).catch((err) =>
          console.error("[tickets] claimGuestTickets failed for", user.email, err));
      }

      const isFirstLogin =
        !!user.created_at &&
        !!user.last_sign_in_at &&
        Math.abs(new Date(user.last_sign_in_at).getTime() - new Date(user.created_at).getTime()) < 10_000;

      if (!profile?.username) {
        // New user — the handle_new_user() DB trigger already inserted a bare
        // profiles row (id only) on signup, so "no username" is the new-user
        // signal. Username stays null until they pick one on /account, and the
        // welcome email is sent from that save so it can greet them by the
        // name they chose.
        if (user.email) {
          syncContact(user.email).catch((err) => console.error("[ActiveCampaign] syncContact failed for", user.email, err));
        }

        // Link non-member invite to this new user, and resolve the jam so we
        // can send them there after account setup
        let inviteJamId: string | null = null;
        if (inviteToken) {
          const admin = supabaseAdmin();
          await admin.from("jam_invites")
            .update({ invited_user_id: user.id, invitee_email: null })
            .eq("token", inviteToken)
            .is("invited_user_id", null);
          const { data: invite } = await admin
            .from("jam_invites")
            .select("jam_id")
            .eq("token", inviteToken)
            .maybeSingle();
          inviteJamId = invite?.jam_id ?? null;
        }

        const postSetup = inviteJamId ? await jamPathById(inviteJamId) : next ?? "/repertoire";
        destination = `/account?next=${encodeURIComponent(postSetup)}`;
      } else {
        if (isFirstLogin && user.email) {
          await enqueueWelcomeEmail(supabaseAdmin(), resend, {
            userId: user.id,
            email: user.email,
            name: profile?.display_name ?? profile?.username ?? undefined,
          });
        }

        if (inviteToken) {
          const admin = supabaseAdmin();
          // Link link-based invites (no recipient yet) to this returning user
          await admin
            .from("jam_invites")
            .update({ invited_user_id: user.id })
            .eq("token", inviteToken)
            .is("invited_user_id", null);
          const { data: invite } = await admin
            .from("jam_invites")
            .select("jam_id")
            .eq("token", inviteToken)
            .maybeSingle();
          destination = invite?.jam_id ? await jamPathById(invite.jam_id) : next ?? "/repertoire";
        } else {
          destination = next ?? "/repertoire";
        }
      }
    }
    destination = destination ?? "/account";

    // Return the redirect with session cookies attached
    const response = NextResponse.redirect(`${origin}${destination}`);
    tempRedirect.cookies.getAll().forEach(({ name, value, ...options }) => {
      response.cookies.set(name, value, options);
    });
    return response;
  }

  return NextResponse.redirect(`${origin}${next ?? "/account"}`);
}
