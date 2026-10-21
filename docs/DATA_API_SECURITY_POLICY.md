# Verbindliche Supabase Data API Sicherheitsrichtlinie

Beschluss: 21.10.2026. Verbindlich für neue Tabellen, Migrationen, RPCs, CI und Wiederherstellung.

1. Neue Tabellen sind standardmäßig nicht über Data API erreichbar. Für den Ersteller postgres sind automatische Berechtigungen neuer public-Tabellen, Funktionen und Sequenzen gegenüber anon, authenticated und service_role widerrufen. Ein GRANT darf nur bewusst in der jeweiligen Migration erfolgen.
2. Für jede neue API-Tabelle müssen CREATE TABLE, ENABLE ROW LEVEL SECURITY, passgenaue RLS-Policies und explizite minimale GRANT-Rechte zusammen in derselben Migration stehen. Nur erforderliche SELECT/INSERT/UPDATE/DELETE-, Sequenz- und RPC-Rechte vergeben.
3. Die Rolle authenticated allein genügt nicht: Policies müssen an den berechtigten Nutzer, Eigentümer oder bestätigten Einladungsumfang gebunden sein. Niemals service_role- oder Secret-Keys im Client oder in öffentlichen Dateien verwenden.
4. Interne Daten gehören in nicht API-exponierte Schemas. Eine neue interne Tabelle in public ist ausschließlich mit schriftlicher Ausnahme zulässig; in derselben Migration RLS aktivieren und Rechte explizit widerrufen.
5. Keine pauschalen GRANT ALL ON ALL TABLES oder ALTER DEFAULT PRIVILEGES ... GRANT auf API-Rollen. SECURITY DEFINER/RPC nur nach überprüfter Zugriffs- und Eingabekontrolle, begrenzter Ausgabe, sicherem search_path und gezieltem EXECUTE.
6. Jede Migration muss mit ihrer tatsächlich registrierten Versionsnummer versioniert unter supabase/migrations hinterlegt sein. Vor Neuaufbau, Branch und db reset vollständige Replay-Kette prüfen. Datenbankänderungen und Repository müssen synchron sein.
7. CI und Unit-Tests verwenden ausschließlich synthetische Fixtures und keine produktiven Supabase-Anfragen. SQL-Lint, Rollen-/RLS-Matrix, Security Advisors und gezielte Abnahme nach Migration sind obligatorisch.
8. Bestehende API-Rechte und Funktionen niemals blind ändern: zuerst Auswirkungen auf Einladung, Profil, Live-Daten, Importe, Familien- und Kinderdaten prüfen. Änderungen fehlertolerant und ohne öffentliche Rechteausweitung durchführen.

Neue API-Tabelle: create table public.example_items (id uuid primary key, owner_id uuid not null); alter table public.example_items enable row level security; create policy owner_read on public.example_items for select to authenticated using ((select auth.uid()) = owner_id); grant select on public.example_items to authenticated;

Supabase Referenz: https://supabase.com/docs/guides/api/securing-your-api

Projekt: giess-check
Noch kein eigenes Supabase-Projekt unter den verbundenen Konten nachgewiesen. Regeln gelten verbindlich vor der Einführung.
