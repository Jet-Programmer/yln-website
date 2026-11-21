# Young Leaders Network website

Responsive static website for the Young Leaders Network (YLN), published on Netlify and prepared for GitHub Pages.

## Pages

- `index.html` — homepage, AI4Climate highlight and interactive quick tour
- `about.html` — mission, vision, values and reserved founding-member profiles
- `opportunities.html` — searchable scholarships, fellowships, internships, events and YLN resources
- `projects.html` — YLN projects, including the AI4Climate research demo
- `partnerships.html` — partnership information
- `join.html` — ways to connect and join YLN
- `contact.html` — email, WhatsApp, Instagram and an email-app contact form
- `donate.html` — donation information; payment routes are intentionally inactive until verified

The official contact channels currently shown are `youngleadersnetwork01@gmail.com`, [WhatsApp](https://wa.me/message/LQ2M3WQJRGPVA1) and [Instagram](https://www.instagram.com/youngleaders.network/).

## Run locally

From this folder:

```powershell
py -m http.server 8000
```

Then open `http://localhost:8000`. No package installation or build step is required.

## GitHub Pages

The workflow in `.github/workflows/pages.yml` runs on pushes to `main`. It checks local page routes, prepares a clean `_site` folder and publishes it with GitHub Pages. In the repository settings, choose **GitHub Actions** as the Pages source.

The Pages artifact includes the public website and AI4Climate demo. Source PDFs, ZIP archives and local project notes are excluded.

## AI4Climate demo

The homepage links to `projects/ai4climate/index.html`. It is an illustrative research prototype for climate-smart irrigation decisions. Its examples and model are not live farm predictions or irrigation prescriptions, and no physical equipment is controlled.

## Opportunities

Listings are sourced from the YLN opportunities document and curated with status labels and direct organizer links. Dates, eligibility, funding and terms can change; applicants should confirm them with the organizer before applying.

## Contact form and donations

The contact form opens a pre-addressed email in the visitor’s mail app. It does not send or store submissions. Donation options remain inactive until YLN confirms the payment links, recipient details, currency and terms. The site does not collect card or bank credentials.
