/**
* Note: Cascade stripe related data when user account is deleted
*/

alter table "public"."customers" drop constraint "customers_id_fkey";

alter table "public"."subscriptions" drop constraint "subscriptions_user_id_fkey";

alter table "public"."users" drop constraint "users_id_fkey";

alter table "public"."customers" add constraint "public_customers_id_fkey" FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "public"."customers" validate constraint "public_customers_id_fkey";

alter table "public"."subscriptions" add constraint "public_subscriptions_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "public"."subscriptions" validate constraint "public_subscriptions_user_id_fkey";

alter table "public"."users" add constraint "public_users_id_fkey" FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "public"."users" validate constraint "public_users_id_fkey";


