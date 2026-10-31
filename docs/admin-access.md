# Admin access

Admins sign in with Discord. Customers can use Discord or a username and password. Tested live on 2026-10-31.

## First admin on a new deployment

The gateway's setup wizard insists on creating a password admin, so that account exists only until a Discord admin replaces it.

1. Set these on the gateway, or Discord sign-in fails:
   - `OAUTH_ALLOWED_REDIRECT_ORIGINS` (the website's origin)
   - `REDIS_CONN_STRING`
2. Run the setup wizard. Use a long random password and discard it after step 6.
3. In the console, set `ServerAddress`, then the Discord client ID and secret, and only then enable Discord. It refuses to enable without the ID and secret. Turn off password registration.
4. Sign in once on the website with the Discord account that will be admin. It must have a verified email.
5. Keep the setup admin signed in until step 6 is done.
6. In the database, in one transaction, with the IDs filled in:

   ```sql
   BEGIN;
   -- The Discord admin
   UPDATE users SET role = 100, auth_version = auth_version + 1 WHERE id = <discord_admin_id>;
   -- The setup admin: an ordinary, disabled account
   UPDATE users SET role = 1, status = 2, auth_version = auth_version + 1 WHERE id = <setup_admin_id>;
   DELETE FROM user_sessions WHERE user_id = <setup_admin_id>;
   COMMIT;
   ```

7. Clear the gateway's cached user data, or restart it along with Redis, so the new roles take effect.
8. Confirm:
   - The setup admin's password is refused, because that account is disabled.
   - Discord sign-in on the admin console reaches the admin menus.

Confirm there's exactly one root account, and that `<discord_admin_id>` is the account you expect, before committing the transaction.

## If you lose the admin's Discord account

Only someone with database access can fix this:

1. Have the replacement Discord account sign in once on the website.
2. Run the promotion `UPDATE` from step 6 for that account.
3. Set the lost account to `role = 1, status = 2`, and remove its sessions.

Keep database access separate from Discord, and test the restore procedure, because this is the only way back in.

## Things to know

- The admin's Discord account should have two-factor login turned on, because it now controls the whole gateway.
- The website's "link Discord" flow can't be tested on `localhost`, because its cookie needs a domain with a dot. Test it on staging.
