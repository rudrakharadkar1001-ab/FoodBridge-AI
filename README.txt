FOODBRIDGE AI - HOW TO PUBLISH (simple steps)

STEP 1 - Unzip this file on your computer.
 Open the folder. You will see: index.html, css, js, shared, assets, netlify, package.json, netlify.toml

STEP 2 - Put it on GitHub
 1. Open github.com and login.
 2. Top right corner: click the "+" button -> "New repository".
 3. Write a name (example: foodbridge-ai) -> click the green "Create repository" button.
 4. On the next page click the link "uploading an existing file".
 5. Open the unzipped folder, select EVERYTHING inside it and drag it into the GitHub page.
 6. Wait until the upload finishes -> click the green "Commit changes" button.

STEP 3 - Publish on Netlify
 1. Open app.netlify.com and login.
 2. Click "Add new project" (or "Add new site") -> "Import an existing project".
 3. Click "GitHub" and choose your repository.
 4. Do not change anything (build command stays empty). Click "Deploy".
 5. Wait 1-2 minutes. Your link is shown at the top of the project page.

IMPORTANT: Deploy from GitHub like above. Do NOT drag-and-drop the folder into Netlify,
because then the database (backend) will not work.

HOW TO CHECK THE DATABASE IS WORKING
 Open your site and scroll to the bottom of the page:
   "Cloud database connected" = everything works and data is shared between all users.
   "Demo mode" = backend was not found; the app still works but data stays in that one browser only.

YOUR LOGO
 Your logo is already added. Big logo (home page): assets/logo.png
 Small round logo (top bar and browser tab): assets/icon.png
 To change them, replace those two files and keep the same names.

YOUR OWN COLORS
 Open css/style.css. The first lines (":root") hold the colors, change them there.

QUICK TEST
 1. Choose Donor -> Create account -> Donate Food -> Submit.
 2. Logout -> choose NGO -> Create account -> click "Request Donation".
 3. Logout -> login as Donor -> Requests tab -> Accept.
 4. Login as NGO -> you see "Your request was accepted" with the donor details.
