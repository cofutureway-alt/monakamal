# Mona Kamel Platform — Database Migration Reference

---

## 1. Quick Migration Commands

```bash
$env:SUPABASE_ACCESS_TOKEN="sbp_xxxxxxxxxxxx"

npx supabase link --project-ref <NEW_PROJECT_ID>
npx supabase db push
npx supabase functions deploy
```

---

## 2. Environment Files to Update

| File | Field |
|------|-------|
| `.env` | `VITE_SUPABASE_PROJECT_ID` |
| `.env` | `VITE_SUPABASE_PUBLISHABLE_KEY` |
| `.env` | `VITE_SUPABASE_URL` |
| `.env` | `VITE_SUPABASE_ANON_KEY` |
| `supabase/config.toml` | `project_id` |

---

## 3. Migration Files (69 files)

Located in `supabase/migrations/` — applied in order by `npx supabase db push`.

```
20260717084807_c7e0538b-882c-467e-b4ee-c66e74476eb5.sql
20260717084830_91cf20bf-12be-4a27-afa0-33a57070313b.sql
20260717085328_e633f183-52a0-4df0-98a3-069ddf1406e2.sql
20260717085731_425cb427-f052-49be-acb5-8227d03b7b10.sql
20260717092202_1cdc024d-51f2-401c-92e3-adb3a2cfa622.sql
20260717092224_c483dd28-afdb-4b17-98d3-5b86690e0fd9.sql
20260717105401_bd7bbc47-aa46-4e0a-83b9-62c241f92519.sql
20260717105805_69e0c4a3-d50f-4aa9-b234-e615a60862cc.sql
20260717112849_24e8cfac-b028-4267-9293-584b0cd52e8f.sql
20260717112916_e9f28c77-9e02-4815-9ede-7dafc3dfb504.sql
20260718160338_b6c6dd95-8dc9-4f35-a6e4-997cbe5374e9.sql
20260718160808_f5646d46-82c6-48ab-9b57-91881049c8fe.sql
20260718160827_408102ad-ea9e-41e3-ae49-29e51fb30753.sql
20260718161613_278453ec-b2d3-4411-a766-e533c02764ef.sql
20260718162148_3b495295-9d25-43bc-8cab-30caf6532f7e.sql
20260718162655_81a751f8-c7e7-4c1a-81ca-09c188bbc2cb.sql
20260719111546_3c610cba-f137-4ea2-b474-53ee0a963bb8.sql
20260719111927_fa3003a0-20fe-429c-a40d-e4dc7ad7709d.sql
20260719112755_02f7cd3b-3472-4793-a15f-49ddbf0f39fd.sql
20260719112816_ca5b6648-c6c4-4bb1-a8a2-52239a254d64.sql
20260719114209_d1fad2ad-1e17-4778-b16b-67682f4e50bb.sql
20260719124300_28728e1e-58b8-49ef-bab5-63851095ebf4.sql
20260719124459_afede148-f621-4391-8582-3e5e11422afd.sql
20260719135708_4f96a3bd-8727-4a3e-8bf5-3a2cc75871b7.sql
20260719135753_86980547-876c-4b91-9a80-375e9d34c42a.sql
20260719140220_9c505078-ca81-42b6-9efb-3f7b80336755.sql
20260719143820_1d866b16-c694-4a3c-9ea1-3f8c4d931f54.sql
20260721094518_0d79a6b3-ff10-495e-9cb0-c272d3d2b0aa.sql
20260721094539_fce68b39-792d-4b67-9329-9ecc066ba413.sql
20260721095504_90c1410f-79a3-4bc1-9210-64fd3be44822.sql
20260721095909_e4cc2a6e-99dd-457e-b01f-a93e02ab0b4e.sql
20260721100601_333581a3-d49a-404d-b10e-1c34d0f3a6c9.sql
20260721102225_72c5279b-8c03-44da-ab75-6a95cde1ba10.sql
20260721102950_044d57f2-eb69-46cb-a7c4-dcf45da8b892.sql
20260721103441_c8ce2c85-cccb-4731-a73c-62a5a78fbec8.sql
20260721104210_58e86630-f0a4-4a2f-a0cf-90db8e972d1e.sql
20260721112842_baa6ecbb-824f-42ad-b27a-7f4cd4e5f278.sql
20260721154753_9ef89c70-6c3d-4447-a4af-c1d6d9d09236.sql
20260722080505_497fd002-1fc4-4eac-a593-5584c63f8791.sql
20260722080529_749e5935-f449-480f-b83f-ba9f1ee146b8.sql
20260722081450_e2576e1d-2b74-46e8-88c6-47f83ccaaeae.sql
20260722083703_13ee0fa1-57dc-49e1-a005-c1c027084f0d.sql
20260722084822_82aa4ba4-7d80-4c89-a74a-2f975a2d0a2e.sql
20260722095823_4ca83cc1-3420-4aad-b4b7-61dfc77533f4.sql
20260722113147_98aea923-aa18-4e10-9a7c-7840fd727d63.sql
20260722125715_de9072fe-bac3-4f73-8ff2-16138a81d277.sql
20260722130833_33b87e44-010e-46c3-a080-907518cd667c.sql
20260722131736_44225ed1-f161-4cef-a9a0-60a50a898cc4.sql
20260722134223_8f2d048a-763d-4c28-9046-30eb8e1a7c27.sql
20260722135549_2a15b0c0-51f7-487f-a38c-67d4fc36e9cc.sql
20260722135604_c2c9f135-3625-4dc1-9aeb-17cad79ad3a5.sql
20260723111517_6593c1b3-c039-4139-9446-a9f23b5ef207.sql
20260723111602_6dcccabd-3f63-4af1-afb4-0a23c348d47b.sql
20260723111619_1c3d5ae3-4be2-4fb4-a701-1681d08f8343.sql
20260723114506_9952c8a7-985c-41e5-a01b-7a7234b582ed.sql
20260723215741_bf344ee1-27a2-49f3-8577-7a16b2fc770e.sql
20260723221129_ee5562d4-0bc0-4fc9-bf1c-292716ecb60d.sql
20260724125002_f4b191d3-60f5-4431-a940-8457cb8a7ab0.sql
20260724125900_04547456-8503-4b17-91a3-0d441d02ba11.sql
20260724130426_ba86181c-2cb5-4ba1-ae5f-4d529d672032.sql
20260724130930_b77763ff-9992-4a00-a186-3574af63785f.sql
20260724131010_d888833f-c5db-4ca0-8f46-dab73983429b.sql
20260724143236_f45a609b-8376-4e1a-b0ef-6a292bcc936e.sql
20260724154505_46674508-bfd1-45a5-a7be-e47711961a20.sql
20260724154620_fbed13c9-3f85-41bf-9d8d-33d72b382499.sql
20260724155521_61943173-fda3-4ef8-9f9d-6fd4d139a290.sql
20260724160433_ac172a38-81d8-492f-8bf7-76b0e03e28ab.sql
20260724161155_b29503b1-1358-4553-9966-fc5b1bee74f4.sql
20260724163033_c6a9f449-cec8-4553-8afb-818d02a1939e.sql
```

---

## 4. Storage Buckets (9 buckets)

> **Important**: Buckets must be created manually — `db push` only creates the RLS policies, not the buckets.

| Bucket | Access |
|--------|--------|
| `thumbnails` | 🌐 Public |
| `avatars` | 🌐 Public |
| `quiz-images` | 🌐 Public |
| `card-assets` | 🔒 Private |
| `payment-proofs` | 🔒 Private |
| `lesson-files` | 🔒 Private |
| `assignment-files` | 🔒 Private |
| `assignment-submissions` | 🔒 Private |
| `book-assets` | 🔒 Private |

### Create All Buckets (PowerShell)

```powershell
$svcKey = "<SERVICE_ROLE_JWT>"
$headers = @{ "apikey" = $svcKey; "Authorization" = "Bearer $svcKey"; "Content-Type" = "application/json" }
$baseUrl = "https://<PROJECT_ID>.supabase.co/storage/v1/bucket"

$buckets = @(
  @{ id = "thumbnails";             name = "thumbnails";             public = $true  },
  @{ id = "avatars";                name = "avatars";                public = $true  },
  @{ id = "quiz-images";            name = "quiz-images";            public = $true  },
  @{ id = "card-assets";            name = "card-assets";            public = $false },
  @{ id = "payment-proofs";         name = "payment-proofs";         public = $false },
  @{ id = "lesson-files";           name = "lesson-files";           public = $false },
  @{ id = "assignment-files";       name = "assignment-files";       public = $false },
  @{ id = "assignment-submissions"; name = "assignment-submissions"; public = $false },
  @{ id = "book-assets";            name = "book-assets";            public = $false }
)
foreach ($b in $buckets) {
  Invoke-RestMethod -Uri $baseUrl -Method POST -Headers $headers -Body ($b | ConvertTo-Json)
  Write-Output "Created: $($b.name)"
}
```

---

## 5. Edge Functions (11 functions)

Located in `supabase/functions/` — deployed by `npx supabase functions deploy`.

| Function | File |
|----------|------|
| `admin-create-student` | `supabase/functions/admin-create-student/index.ts` |
| `admin-delete-student` | `supabase/functions/admin-delete-student/index.ts` |
| `fawaterak-initiate` | `supabase/functions/fawaterak-initiate/index.ts` |
| `fawaterak-methods` | `supabase/functions/fawaterak-methods/index.ts` |
| `fawaterak-webhook` | `supabase/functions/fawaterak-webhook/index.ts` |
| `kashier-initiate` | `supabase/functions/kashier-initiate/index.ts` |
| `kashier-refund` | `supabase/functions/kashier-refund/index.ts` |
| `kashier-webhook` | `supabase/functions/kashier-webhook/index.ts` |
| `paymob-initiate` | `supabase/functions/paymob-initiate/index.ts` |
| `paymob-refund` | `supabase/functions/paymob-refund/index.ts` |
| `paymob-webhook` | `supabase/functions/paymob-webhook/index.ts` |

### Webhook URLs (configure in each payment gateway dashboard)

| Gateway | Webhook URL |
|---------|-------------|
| PayMob | `https://<PROJECT_ID>.supabase.co/functions/v1/paymob-webhook` |
| Kashier | `https://<PROJECT_ID>.supabase.co/functions/v1/kashier-webhook` |
| Fawaterak | `https://<PROJECT_ID>.supabase.co/functions/v1/fawaterak-webhook` |

---

## 6. Post-Migration: Create Admin User

```powershell
# Step 1 — Create auth user
$svcKey = "<SERVICE_ROLE_JWT>"
$headers = @{ "apikey" = $svcKey; "Authorization" = "Bearer $svcKey"; "Content-Type" = "application/json" }
$body = @{ email = "admin@example.com"; password = "YourPass##"; email_confirm = $true } | ConvertTo-Json
$user = Invoke-RestMethod -Uri "https://<PROJECT_ID>.supabase.co/auth/v1/admin/users" -Method POST -Headers $headers -Body $body

# Step 2 — Set admin role (disable guard trigger temporarily)
$env:SUPABASE_ACCESS_TOKEN = "sbp_xxxx"
npx supabase db query --linked "ALTER TABLE public.profiles DISABLE TRIGGER trg_prevent_privileged_profile_updates; UPDATE public.profiles SET role = 'admin'::public.app_role WHERE id = '$($user.id)'; ALTER TABLE public.profiles ENABLE TRIGGER trg_prevent_privileged_profile_updates;"
```
