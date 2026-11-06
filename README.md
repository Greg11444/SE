# Steadfast Express – website + backend

Node.js + PostgreSQL. The `public/` folder is the website; `server.js` is the API and also serves the site.

## Deploy on Render
1. Push this folder to GitHub.
2. Render: New > PostgreSQL. Copy its Internal Database URL.
3. Render: New > Web Service from your repo. Build command `npm install`, start command `npm start`.
4. Environment variables: DATABASE_URL, ADMIN_PASSWORD (12+ characters), JWT_SECRET (32+ random characters).
5. Open your site, add `#admin` to the address, and sign in.

Never put the password in the code or in GitHub. It only lives in Render's Environment settings.

## Front end on cPanel instead
Upload `public/` to public_html, set `const API = "https://your-service.onrender.com";` at the top of script.js,
and set FRONTEND_ORIGIN on Render to your domain (for example https://yourdomain.com).
