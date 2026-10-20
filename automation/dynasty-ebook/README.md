# Dynasty e-book delivery

When someone fills out the form at `/dynasty`, the page POSTs to a Google Apps Script web app ([Code.gs](Code.gs)). The script logs the lead to a Google Sheet and emails them the PDF from your Google Workspace account.

```
/dynasty form ──POST──▶ Apps Script web app ──▶ "Leads" tab in a Google Sheet
                                            └─▶ Gmail: "Your copy of Dynasty" + PDF attached
```

This folder is excluded from the Docker image (`.dockerignore`), so the script isn't served on the site.

## One-time setup (about 10 minutes)

1. **Export the final PDF.** Open `Dynasty_Revised_v4.docx` in Word and choose File → Save As → PDF. The `Dynasty- Building Championship Teams… .pdf` in iCloud is older (Aug 14) than v4 (Sep 3), so don't use that one.
2. **Upload it to Google Drive** while signed in as the account the emails should come from (for example brad@candidatehub.io). Keep it private; the script attaches it to each email, so nobody needs a share link. Open the file and copy its ID from the URL: `https://drive.google.com/file/d/<THIS_PART>/view`.
3. **Open the lead sheet.** It already exists, with its header row: [Dynasty E-Book Leads](https://docs.google.com/spreadsheets/d/1Z5WncT2d3VnwHAPDQO206BcoO8NzOlzYdoUdCytJ5t4/edit) in the Sales folder on Drive. Go to **Extensions → Apps Script**. The first time `setup` runs, the script renames the first tab to "Leads".
4. **Paste the script.** Replace everything in `Code.gs` with the contents of [Code.gs](Code.gs) and save.
5. **Add script properties.** Go to **Project Settings (gear icon) → Script properties** and add:
   | Property | Value |
   |---|---|
   | `EBOOK_FILE_ID` | the Drive file ID from step 2 (required) |
   | `NOTIFY_EMAIL` | an address to notify on every new lead (optional) |
   | `REPLY_TO` | a different reply-to address (optional) |
6. **Authorize and test.** In the editor, choose the `setup` function and click **Run**, then approve the Gmail, Drive and Sheets permissions. Then run `testSend` and check your inbox for the email and attachment.
7. **Deploy.** Click **Deploy → New deployment → Web app**, then set:
   - Execute as: **Me**
   - Who has access: **Anyone**

   Copy the web app URL (`https://script.google.com/macros/s/…/exec`).
8. **Connect the page.** In `dynasty.html`, replace `REPLACE_WITH_APPS_SCRIPT_WEB_APP_URL` in the form's `data-endpoint` attribute with that URL, then commit and deploy the site.
9. **Test it live.** Submit the form at `/dynasty` with your own email. You should get the email, and a new row should appear in the Leads tab.

## Editing the script later

After you change the script, go to **Deploy → Manage deployments → Edit (pencil) → Version: New version → Deploy**. Doing it this way keeps the same URL. A *New deployment* creates a new URL, and you'd have to update the page again.

## What gets logged

Each row records: timestamp, first name, email, marketing consent (yes/no), delivery status, the 5-question quiz score/tier/weakest pillar (if they took it), UTM parameters, `fbclid` / `li_fat_id` / `gclid`, referrer, landing URL and user agent.

Tag your social links with UTMs so you can see which posts drive downloads, for example:

```
https://candidatehub.io/dynasty?utm_source=linkedin&utm_medium=social&utm_campaign=dynasty_launch&utm_content=post1
```

## Consent (CASL)

Sending the e-book someone asked for is fine. Only add people to marketing emails if **Marketing consent = yes**. That checkbox is unchecked by default, as CASL requires for express consent.

## Limits

- Google Workspace accounts can send to about 1,500 recipients a day through Apps Script; consumer Gmail allows about 100. Each download counts as one.
- If the same address submits again within 10 minutes, it's logged as a duplicate and the email isn't sent again (this stops double-click resends).
- Delivery errors are logged in the Status column, and the form shows the visitor a "try again" message.
