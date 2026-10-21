# Ratewell.online — Domain ko naye server par point karne ki guide

Assalam-o-Alaikum! Aapko sirf **ek DNS record** change karna hai (2 minute ka kaam).
Uske baad hum trusted (free) SSL laga denge — phir koi certificate warning nahi aayegi.

---

## Server details (ye sirf hamare paas rahega)

| Cheez | Value |
|-------|-------|
| Server IP | **2.58.203.217** |
| Domain | **ratewell.online** (aur www.ratewell.online) |

---

## Step 1 — Hostinger login karein

1. Browser me kholein: **https://hpanel.hostinger.com**
2. Us account se login karein **jisme `ratewell.online` domain mojood hai**
   (agar nhi pata kis account me hai, to Domain ek dafa verify kar lein — top-right me account email se pata chalega)
3. Login hone ke baad left menu me **Domains** par click karein
4. List me se **ratewell.online** ke aage **Manage** / **Manage domain** par click karein

---

## Step 2 — DNS record change karein

1. Us domain ke page par left/side menu me **DNS / DNS Zone** (ya "DNS Records") kholein
2. Table me **Type = A** wali row dhoondein jahan **Name = `@`** (ya blank) ho
3. Us row ke aage **Edit** (pencil icon) par click karein
4. **Content / Points to** field me jo purana IP likha hai (jaise `2.57.91.91`) usko **delete** karke likhein:

   ```
   2.58.203.217
   ```

5. **TTL** ko jaisa hai waisa hi rehne dein (koi change nahi)
6. **Save / Update** par click karein ✅

### Agar `A` record na mile (agar CNAME ya purana Parking record ho)
- Jo bhi row `ratewell.online` (`@`) ke liye ho, use **Edit** karke Type = **A**, Name = **@**, Value = **2.58.203.217** kar dein.
- Extra/duplicate records ho to delete kar dein.

---

## Step 2b — `www` ke liye bhi karein (zaroori)

1. Table me **Type = CNAME**, **Name = `www`** wali row dhoondein
2. Uska Content/Points to ho:

   ```
   ratewell.online
   ```

   (agar `www` ka A record ho to uski value bhi `2.58.203.217` kar dein)
3. **Save** karein

---

## Step 3 — Hum ensure karein ki lag gaya

Aap ye 2 records save karne ke baad humein bata dein. Hum check kar lenge:

```
A      @     2.58.203.217
CNAME  www   ratewell.online
```

DNS change internet par **10 minute se 24 ghante** me poori tarah phelta hai
(aksar 15–30 minute me ho jata hai).

---

## Step 4 — Trusted SSL (ye hum karenge)

Jab DNS point ho jaye, hum server par ye command chala kar **free Let's Encrypt certificate**
laga denge — isse browser me koi warning nahi aayegi:

```
certbot --nginx -d ratewell.online -d www.ratewell.online
```

Iske baad site ye ban jayegi:

```
https://ratewell.online          ← trusted, permanent SSL
```

---

## Zaroori baatein

- **Pura domain delete na karein** — sirf A record ki value badalni hai. Nameservers (NS) ko haath na lagayein.
- Change ke baad ho sakta hai kuch der purani site chale — ye normal hai, DNS propagation kehlata hai.
- SSL lagne ke baad purana tunnel hata denge, phir sirf `https://ratewell.online` se sab kuch chalega.
- Koi bhi step samajh na aaye to screen ka screenshot bhej dein.

---

## Quick reference (jo badalna hai)

| Type | Name | Purani value | Nayi value |
|------|------|--------------|------------|
| A | @ | 2.57.91.91 (ya jo bhi ho) | **2.58.203.217** |
| CNAME | www | (jo bhi ho) | **ratewell.online** |
