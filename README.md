# GST Pro ERP — GitHub Online Database & Cloud Hosting

This directory contains the production software ready to upload and host on **GitHub Pages**, **Custom Domains**, or run directly on any desktop or tablet browser.

## Key Capabilities & Architecture

- **1st Login Page Multi-Client Isolation**:
  - The software opens directly to the login page where each client authenticates with their unique User ID & password.
  - After logging in, only the company workspaces created by or shared with that specific client are loaded.
  - Company creators have full authority to create, edit, export, share, and delete their own companies.

- **User ID & Password Generator with Subscription Validity (DD/MM/YYYY)**:
  - Generate clean User IDs (`client_XXXX`) and secure passwords with one click.
  - Set access validity days with quick shortcuts: `1 Month` (+30d), `3 Months` (+90d), `6 Months` (+180d), `1 Year` (+365d), `3 Years` (+1095d).
  - Manual expiry date adjustments in strict `DD/MM/YYYY` format.
  - Automatic expiration enforcement: expired accounts cannot log in until renewed by the administrator.

- **GitHub Real-Time Database**:
  - Reads and writes transaction data (`data/companies/*.json`, `data/system.json`) directly via the GitHub API.
  - Instant company creation and deletion supported directly in cloud storage.

- **Automated Daily Backups**:
  - Synchronizes and saves full daily folder backups under `Backups/`.
  - Manual single-click `.gsterp` company backup exports available right from the workspace selector.

- **100% Client-Side & Standalone**:
  - Operates directly in any modern browser without requiring a backend Node.js server.
  - Includes embedded fallback data so the software never shows blank pages or crashes.

## How to Host on GitHub Pages
1. Push the contents of this `GitHub` folder to your GitHub repository (e.g. `main` or `gh-pages` branch).
2. Go to your repository on GitHub -> **Settings** -> **Pages**.
3. Under **Branch**, select `main` (root) and click **Save**.
4. Your software will be live at `https://<username>.github.io/<repo>/` or your connected custom domain!

## Data Structure
- `data/system.json`: User credentials, authentication, expiration dates, and sync settings.
- `data/companies/index.json`: Master directory of registered companies.
- `data/companies/*.json`: Multi-company records (sales, purchases, items, parties, cash & bank).
- `Backups/`: Daily snapshot folders organized by company and date.
