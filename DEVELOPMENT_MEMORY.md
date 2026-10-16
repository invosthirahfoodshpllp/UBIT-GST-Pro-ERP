# UBIT Pro ERP 15-10-2026 - Master System Memory & Architectural Reference

> **CRITICAL DIRECTIVE**: Always read and consult this file before performing modifications to any code, scripts, or assets. This document preserves the entire operational memory, UI specifications, business logic, module rules, and user preferences.

---

## 1. System Overview & Technology Stack
- **Product Name**: UBIT Pro ERP (Enterprise GST Billing & Accounting Suite)
- **Architecture**: Single Page Application (React / Preact / Tailwind / Lucide Icons / Enterprise Engine)
- **Runtime Environment**:
  - Web Server / API: `ubit-server.exe` / `local-server.ps1` (port 5173 / sync port 4500)
  - Desktop Shell / Background: `Launch-Software.bat`, `Start-ERP-Background.vbs`, `Stop-Server.bat`
  - GitHub Hosting Directory: `GitHub/` (contains static build, `404.html`, `license-admin.html`, `data/`, `assets/`)
- **Core Storage**:
  - `data/system.json`: System settings, backup config, authorized administrative accounts (Pradheep & Hari).
  - `data/companies/index.json`: Company catalog and metadata.
  - `data/companies/<comp_id>.json`: Comprehensive company dataset (parties, items, godowns, sales, purchases, orders, payments, expenses, audit trails).

---

## 2. Complete Module Catalog & Menus
1. **General / Dashboard (`home`)**:
   - Total Sales, Total Purchases, Total Receivables, Total Payables, Cash in Hand, Total Bank Balance, Current Stock Value.
   - **Strict Tile Layout & Rules**:
     - Icons centered in all summary tiles.
     - "Total Payable": Text underneath must be clean (do NOT show "from show to number of party").
     - "Cash in Hand": No subtitle/line underneath the amount.
     - "Total Bank Balance": Titled "Total Bank Balance" (no subtitle underneath).
     - "Purchase": Display title as "Purchase" (do NOT show "this month").
     - "Current Stock Value": Show title and value only (remove "at purchase price valuation").
     - **Calendar Filter Scope**: Dashboard date filter applies **ONLY** to Purchases and Expenses. It does **NOT** filter Payables, Receivables, Cash in Hand, Total Bank Balance, or Stock in Hand.
     - In all sections, references to parties must strictly use the label **"Party"**.

2. **Sales & Income**:
   - `sale_invoices`: Sale Invoices register
   - `payment_in`: Payment-In Receipts
   - `sale_order`: Sale Orders
   - `delivery_challan`: Delivery Challans
   - `credit_note`: Credit Notes (Sales Return)
   - `estimate_quotation`: Estimates & Quotations
   - `proforma_invoice`: Proforma Invoices
   - `pos_billing`: Counter POS Billing

3. **Purchases & Expenses**:
   - `purchase_bills`: Purchase Bills register
   - `payment_out`: Payment-Out Vouchers
   - `purchase_order`: Purchase Orders
   - `debit_note`: Debit Notes (Purchase Return)
   - `expenses`: Direct & Indirect Expense records

4. **Master Records**:
   - `party_details`: Customers, Suppliers, Ledgers.
     - Amount column click sort: Up/Down arrow in same color as amount text (no Pay/Rec colored badges).
     - Mobile number entry: strictly 10 digits only; input box empty by default (no placeholder text).
     - Address fields: separated into **Door No & Street**, **City**, **State**, and **Country**.
   - `item_details`: Products, Services, Stock.
     - Quantity header click sort (3-state cycle):
       1. High to Low
       2. Low to High
       3. Default recent transactions
     - Item name header click sort (3-state cycle):
       1. A to Z
       2. Z to A
       3. Default recent transactions
     - Filter icon next to item removed.
   - `godown_mgmt`: Godowns & Warehouses.

5. **Cash, Bank & Accounts**:
   - `cash_in_hand`, `bank_accounts`, `cheques`, `loan_accounts`.
   - `acc_receivable_ledger`, `acc_payable_ledger`, `acc_all_parties`, `acc_trial_balance`, `acc_pnl`, `acc_balance_sheet`.

6. **Company Profile & Creation**:
   - Super Admin and Google account users have full permission to create new companies.
   - **Company Photo / Logo Upload**:
     - Includes automatic dominant color extraction from uploaded logo image to suggest brand theme color.
     - Saves `photoUrl` and `logoUrl` into the company record.
   - Company deletion safeguard: Requires user to download backup or sync to Google Drive before permanently deleting.

---

## 3. Unified Dynamic Theme Color System
- **Default Background Color**:
  - The login page dark navy blue from reference image (`#111728` / `rgb(17, 23, 40)` / `.bg-navy-900`) for heading, menus, submenus, and software license section.
- **Default Text & Icon Color**:
  - Standard grey (`#464953`) across all menus, submenus, and software license section by default when no custom color is selected. Active menu items are highlighted in clean bold white (`#ffffff`).
- **Separate Selection Controls in Settings**:
  - **Heading, Menu, Submenu & License Section**: Independent color picker for background (`themeColor`).
  - **Text Color**: Independent color picker for menu & submenu text (`menuTextColor`, default `#464953`).
  - **Icons Color**: Independent color picker for menu & submenu icons only (`menuIconColor`, default `#464953`).
  - **Default / Reset Button**: Instantly reverts all theme elements back to `#111728` background and `#464953` grey text & icons.
  - **Save as Custom Button**: Star icon removed.
- **Cohesive Coverage**:
  - **Top Navigation Header**: Entire top bar where "UBIT ERP GST Billing Software", Company selector, and current company name pill appear.
  - **Sidebar Header**: Area directly under the software branding.
  - **Sidebar Menus**: All main menu items.
  - **Sidebar Submenus**: All child items when expanded (with clean darker tint `rgba(0, 0, 0, 0.22)`).
  - **Software License Section**: The bottom section of the sidebar containing license expiry, active user, and logout.
  - **Modals & Popups**: Centered in middle of screen with themed top accent border.
  - **Invoices**: Header accents and summary totals.
- **Default for New Companies & Demo**:
  - For Demo Mode and any new user who does not select a theme color while creating a company, `#111728` is applied by default as background and `#464953` as text/icons.
- **Demo Mode Live Preview & Non-Save Enforcement**:
  - Demo mode users CAN edit colors and see live real-time preview across header, sidebar, submenus, and license section.
  - Clicking Save in Demo Mode displays popup `Cannot save changes in demo mode.` and automatically reverts the theme back to `#111728` and `#464953`.
- **Persistence in Memory**:
  - For normal companies, selected theme is saved with the company record and in `localStorage.setItem('ubit_erp_theme_' + compId, color)` so every time the software opens, the theme matches the user's selection.

---

## 4. Transaction Lists & Toolbar Requirements
Across all 10 transaction modules (`sale_invoices`, `payment_in`, `sale_order`, `delivery_challan`, `credit_note`, `purchase_bills`, `purchase_order`, `debit_note`, `expenses`, `payment_out`):
- **Side-by-Side Alignment Next to Total Tile**:
  - `[ Total Summary Tile ]` and `[ Search Bar ] [ Print ] [ PDF ] [ Excel ]` are positioned directly next to each other on the same top row (`.erp-tile-toolbar-row`).
  - Search Bar, Print, PDF, and Excel buttons are all straightly aligned next to each other.
  - Table headers appear immediately below this combined row.
- **Search Bar Scope**:
  - Scoped strictly to the active module.
  - Respects the selected Date Filter range (only searches within the filtered transactions).
  - Searches across: Party Name, Invoice/Voucher No, Amount/Value, and Shop Code.
- **Bulk Actions**:
  - **PDF Export**: Generates individual PDF transactions with corresponding transaction numbers into user-selected directory.
  - **Excel Export**: Single consolidated spreadsheet with user company header (Company Name, Address, Phone, GSTIN, FSSAI, PAN) on top and summary totals at bottom.
- **Table Sorting Arrows**:
  - Table headers use unified up/down arrows in the exact color of the column header text (no green/red color clashes).

---

## 5. Voucher & Invoice Entry Rules
- **Party Selection**:
  - Blank input by default.
  - On focus/click: dropdown showing 5 parties with smooth scrolling for more.
  - Instant search across Party Code, Name, GSTIN, and Mobile Number.
- **Cash / Credit Default**:
  - Cash is the default selection; user can change to Credit with one click.
- **Due Date Synchronisation**:
  - Checkbox next to Due Date: "Same as Delivery Date".
  - If unticked or omitted, bill date defaults as due date.
- **Settings Visibility**:
  - Columns/fields marked hidden in settings must not appear during entry or in printed invoices.

---

## 6. Theme & Color Styling Specifications
- **Unified Color Palette & System Defaults**:
  - **Default Theme Background**: `#10263c` for heading (header), sidebar menus, submenus, and software license section for ALL users and demo users (unless explicitly selected or extracted from uploaded company logo).
  - **Default Text, Font & Icons**: Plain pure white (`#ffffff`) for all text, headings, menus, submenus, and software license section by default.
  - **Submenu & Menu Styling**: NO background box around text in main menu or submenu on hover, click, or active state (`background-color: transparent !important; background: none !important; border: none !important; box-shadow: none !important;`).
  - **Settings "Default" Button**: Resets heading, menus, submenus, and software license back to `#10263c` background and `#ffffff` font and icons.
- **Search Bar in All Pages**:
  - Inside the transaction action toolbar (next to Print, PDF, Excel), the placeholder strictly displays **`"Search"`** across all pages.
- **Demo Mode Capabilities**:
  - User can perform all entries (sales, purchases, payments, expenses, etc.).
  - User can test all reports, filters, and design themes with live preview.
  - Demo changes cannot be saved permanently; attempting to save reverts theme to default `#10263c` and `#ffffff`.
- **Automatic Silent Reset on Exit / Logout**:
  - When the user exits or logs out from Demo Mode:
    - **All changes made during the demo session are deleted automatically in the background**.
    - The demo database resets to the clean, pristine demo template.
    - **Do NOT show any confirmation popup** when logging out of demo mode. The wipe must be completely silent and seamless.

---

## 7. Popup & Modal Architecture
- **Centered Placement & Themed Styling**:
  - ALL popups, dialogs, modals, and drawers must be positioned in the **dead center of the viewport** (`fixed inset-0 flex items-center justify-center`). No popup may dock at the top of the browser.
  - Replaced browser native `window.alert` with custom centered modal styled with `var(--ubit-active-theme, #10263c)`.
  - Replaced browser native `window.prompt` (e.g., during Google Authenticator login and PO-to-bill invoice number prompts) with custom centered modals (`window.__ubitPromptAsync` and `window.__ubitShowGoogleAuthModal`).
- **Company Deletion Safeguard (2-Button Centered Modal)**:
  - Title: **"Take Backup before deleting the company"**
  - Displays exactly 2 backup options in the center of the page:
    - **Button 1**: `Download` (downloads full company JSON/gsterp archive).
    - **Button 2**: `Backup to Drive` (backs up company database to connected Google Drive).
  - Both options proceed to delete the company cleanly once the backup is generated.
- **Backup All Company 2-Option Modal**:
  - Clicking "Backup All Company" displays a centered modal with 2 options:
    - **Button 1**: `Save to Local Drive` (generates full JSON/gsterp archive download).
    - **Button 2**: `Save to Google Drive` (syncs all company databases to connected Google Drive).

---

## 8. Security, Licensing, Google Authenticator & Company Selection Hub
- **Authentication & Google Authenticator**:
  - Customers can only log in using **Google Authenticator** (Google Sign-In).
  - Native prompt replaced with custom centered Google Authenticator modal.
  - Auto-backup of all companies to Google Drive triggers automatically whenever a customer creates an account / logs in.
- **Select Company Screen Requirements (Applies to New Users, Demo Users, and Super Admins)**:
  - Screen title: strictly **"Select Company"** (no "Workspace" suffix).
  - **Demo Workspace Removed After Login**:
    - After login, only saved companies linked to that user account open on the "Select Company" page.
    - Demo workspace (`comp_demo`, `comp_demo_workspace`, `isDemo`) is completely excluded from user company listings for all accounts (new users, demo users, and super admins).
  - **Single Straight Line Alignment**:
    - The top toolbar displays `[ Select Company ]` on the left and three action buttons on the right arranged in a single straight line (`flex-nowrap`, `shrink-0`):
      1. `[ Backup All Company ]`: Opens the 2-option centered backup modal ("Save to Local Drive" and "Save to Google Drive").
      2. `[ Import Company ]`: Imports company file (label changed from "Import Company (.gsterp)").
      3. `[ + Add New Company ]`: Adds new company.
    - The `[ Demo Workspace ]` button is completely removed from the toolbar.
    - In the empty state card, `[ Try Demo Workspace ]` is removed, showing only `[ + Create Your First Company ]`.
    - Added user companies are displayed in the bottom section.
- **Company Purge & Retention Policy**:
  - Only **`comp_demo`** (UBIT Demo Enterprise) is retained in the background template. All non-demo companies (including any locally created admin companies) are wiped on fresh system startup to maintain clean state.
- **Permitted Admin Users in `system.json`**:
  - Only **`Pradheep`** and **`Hari`**.
  - All other admin and demo users (`admin`, `manager`, `biller`, etc.) are removed.
- **Google Account License Policy**:
  - For every Google account login, license is granted for **7 calendar days from the date of creation** (strictly date-based `DD/MM/YYYY`, valid until 23:59:59 of the 7th calendar day).
- **Single Active MAC Device Enforcement**:
  - License Portal (`license-admin.html`) displays user ID and active MAC address.
  - Clicking on a user expands/shows history of all MAC IDs that have logged in.
  - **Rule**: At any given time, **ONLY ONE MAC ID can be active** per user account.
  - **Auto-Logout Mechanism**:
    - If a user logs into a new PC / MAC address, the system automatically marks the new MAC as active and **immediately logs out the oldest MAC ID**.
    - If the user interacts with the ERP on the deactivated PC, the system displays `"Multiple PC usage detected. Session logged out."` and redirects to the login screen.
  - Admin can completely restrict or disable software usage per account from `license-admin.html`.

---

## 9. Quality Assurance & Verification Checklist
Before finishing any session:
1. Run syntax verification: verify both `assets/index-BmCd4CNB.js` and `GitHub/assets/index-BmCd4CNB.js`.
2. Verify zero background task leaks with `manage_task list`.
3. Confirm that all 10 transaction modules render without console errors.
4. Verify centered modals and theme consistency.
5. Verify `system.json` contains only Pradheep and Hari.

---

## 10. Table Styling, Universal Typography & Action Menu Standards
- **All Tables Text & Icons**:
  - In all tables (`sale_invoices`, `purchase_bills`, `sale_order`, `purchase_order`, `payment_in`, `payment_out`, `delivery_challan`, `credit_note`, `debit_note`, `expenses`, `parties`, `items`, `godown_mgmt`, `bank_accounts`, `reports`, etc.):
    - All text, headers (`th`), data cells (`td`), amounts, dates, and voucher/invoice numbers display in **default black color (`#000000`)**.
    - All table icons (sort arrows, header icons, row action icons like Print, Share, 3-dots, View, Edit, Duplicate) display in **plain black (`#000000`)**.
- **Action Open Dropdown Menu (3-dots popover)**:
  - All icons display in **plain black (`#000000`)** and all text in **plain black (`#000000`)**.
  - **Cancel** and **Delete** are the **ONLY** items with color for both text and icon:
    - `Cancel`: text is amber (`#d97706`), icon is amber (`#d97706`).
    - `Delete`: text is rose/red (`#e11d48`), icon is rose/red (`#e11d48`).
- **Protected Status Badges & Conversion Action Buttons (Preserve Full Color)**:
  - `Paid`: Emerald green badge & text (`#047857`).
  - `Unpaid`: Rose red badge & text (`#be123c`).
  - `Used`: Emerald green badge & text (`#047857`) for Payment-In and Payment-Out.
  - `Unused`: Amber badge & text (`#b45309`) for Payment-In and Payment-Out.
  - `Convert to Sale`: Emerald green action button (`bg-emerald-600 text-white`).
  - `Convert to Purchase`: Rose red action button (`bg-rose-600 text-white`).
  - Order status badges (`Order Completed` / `Converted`, `Order Overdue`, `Order Due`, `Order Pending`) retain their designated badge colors.
  - Primary CTA buttons (e.g., `+ Add Sale`, `+ Add Purchase`, `+ Add Payment`) retain their designated background colors with white text.
- **Menu and Sub-Menu Pages Content**:
  - All menu and sub-menu pages text and fonts inside the main content area default to **black (`#000000`)**.
  - Top navigation header and sidebar menu/sub-menu background (`#10263c`) and plain white font/icons (`#ffffff`) remain strictly preserved.
- **Login Page**:
  - The Google sign-in button text displays strictly as **`"Sign in with Google"`** (changed from "Sign in with Google Authenticator").

---

## 11. Clean Action Icons, Party Typing & Order Conversion Standards
- **Clean Action Icons All Over the App**:
  - Print icons and all table action icons have NO colored outer boxes (green, cyan, amber, etc.).
  - All action icon buttons (`Print`, `Share`, `Preview`, `Edit`, `3-dots`) display on transparent backgrounds with plain black icons (`p-1.5 text-black hover:bg-slate-100 rounded`).
- **Sales Invoice Party / Customer Selection**:
  - Typing option is provided via a customer search input that filters matching parties by name, phone, code, or GSTIN in real time.
  - Once a party is selected, the dropdown name list is completely hidden, and only the selected party name and legal details are shown.
  - A "Change Customer" button allows users to re-open the search input if they wish to select a different party.
- **Convert to Sale & Convert to Purchase Flow**:
  - Clicking `Convert to Sale` (or `Convert to Purchase`) opens the full invoice/bill creation modal (same as entering a new invoice) pre-filled with order details.
  - Users can freely edit item quantities, remove items using the row trash button, add new items, or edit invoice numbers before saving.
  - Once saved:
    - The `Convert to Sale` / `Convert to Purchase` button is hidden.
    - The created transaction number (e.g., `#INV-...` or `#BILL-...`) is displayed in the action section.
    - Plain black `Preview`, `Print`, and `3-dots` icons are displayed alongside it:
      - `[ Convert to Sale ]`   `[ Preview ]`   `[ Print ]`   `[ 3dot ]`
      - `[ Convert to Purchase ]`   `[ Preview ]`   `[ Print ]`   `[ 3dot ]`
      - Post-conversion: `[ #INV-XXX ]`   `[ Preview ]`   `[ Print ]`   `[ 3dot ]`



---

## 12. Sale Order Preview, UPI QR Code Remark & Universal Party Picker
- **Sale Order Preview & General (Terms & Conditions + Scan & Pay QR Code)**:
  - In Sale Order preview modal (`Ije`) and document viewer/print export (`obe`):
    - Appended **Bank Details & Scan to Pay QR Code**: Renders bank account name, account number, IFSC code, UPI ID, and interactive QR code with `upi://pay?pa=${pa}&pn=${pn}&am=${am}&tn=${encodeURIComponent(transactionNo)}&cu=INR`.
    - Appended **Terms & Conditions**: Displays custom order notes or default company terms & conditions (`s?.meta?.termsAndConditions`).
    - Appended **Authorized Signatory** box with company signature line and designation.
  - **UPI QR Code Remark & Amount Automation**:
    - All QR code generation (`N9` Sales Invoice, invoice print templates, `obe` document viewer, general viewer) bakes the exact transaction number (`invoiceNo` or `orderNo`) into the UPI payment note parameter (`tn=`).
    - The total payable value is baked into `am=${total.toFixed(2)}`.
    - When customers scan using Google Pay, PhonePe, or Paytm, the transaction reference is auto-filled into the remark/note field and appears directly in the business merchant statements.
    - Payment entry rule: Payments are recorded against converted Sales Invoices.
- **Universal Party Picker Across All 9 Transaction Forms**:
  - Implemented `ERPUniversalPartyPicker` (`window.__ERPUniversalPartyPicker`) universally across:
    1. **Sales Invoice** (`N9`)
    2. **Purchase Bill** (`j9`)
    3. **Sale Order** (`tue`)
    4. **Purchase Order** (`dbe`)
    5. **Delivery Challan** (`cbe`)
    6. **Credit Note** (`nbe`)
    7. **Debit Note** (`abe`)
    8. **Payment In** (`$Ae`)
    9. **Payment Out** (`eue`)
  - **Behavior & Appearance**:
    - **Initial State**: Blank input box (`placeholder=""`) with search icon and caret.
    - **Dropdown Trigger**: On click or typing, an absolute dropdown opens directly underneath displaying **5 visible parties** (`maxHeight: "190px"`, `overflow-y-auto`) with smooth scrolling for larger directories.
    - **Dropdown Row Content**: Strictly displays ONLY **Party code**, **Party name**, and **Balance with arrow** (`Hd` balance badge with inward/outward directional arrow and `₹ balance`). Strictly hides address and GST number during selection.
    - **Post-Selection State**: Dropdown closes immediately. Displays a clean selected party card showing:
      - Party Name
      - Address
      - GSTIN
      - Current Balance (with arrow)
      - A "Change" button to reopen the search box if the user wants to switch parties.

---

## 13. Inline Date Filter Header Bar Across 7 Transaction Pages & PO Terms Suppression
- **Inline Date Filter Header Bar**:
  - Unified the page title row and date filter into a single top header row across 7 target pages:
    1. **Sale Invoices** (`sale_invoices`): `Sale Invoices`  `Date Filter:`  `[Dropdown]`  `Range: ... to ...`  `+ Add Sale`
    2. **Purchase Bills** (`purchase_bills`): `Purchase Bills`  `Date Filter:`  `[Dropdown]`  `Range: ... to ...`  `+ Add Purchase`
    3. **Sale Orders** (`sale_order`): `Sale Orders`  `Date Filter:`  `[Dropdown]`  `Range: ... to ...`  `+ Add Sale Order`
    4. **Purchase Orders** (`purchase_order`): `Purchase Orders`  `Date Filter:`  `[Dropdown]`  `Range: ... to ...`  `+ Add Purchase Order`
    5. **Delivery Challans** (`delivery_challan`): `Delivery Challans`  `Date Filter:`  `[Dropdown]`  `Range: ... to ...`  `+ Create Delivery Challan`
    6. **Sale Return / Credit Notes** (`credit_note`): `Sale Return / Credit Notes`  `Date Filter:`  `[Dropdown]`  `Range: ... to ...`  `+ Add Credit Note`
    7. **Purchase Return / Debit Notes** (`debit_note`): `Purchase Return / Debit Notes`  `Date Filter:`  `[Dropdown]`  `Range: ... to ...`  `+ Add Debit Note`
  - Completely eliminated the separate standalone date filter card row underneath for these 7 pages.
  - Dynamic preset changes immediately update date range display and underlying table filtering.
- **Hide Terms & Conditions in Purchase Order**:
  - In document preview / print viewer (`obe`) and modal viewer (`(Me || Jt)`):
    - Strictly suppressed Terms & Conditions section when `docType === "purchase_order"` or `Et` is active.
    - Terms & Conditions remains preserved on Sale Invoices, Sale Orders, and Purchase Bills as required.
- **Verification & Testing**:
  - Validated JS module syntax with `node --experimental-vm-modules` (0 errors).
  - Executed automated headless Chrome CDP test suite verifying all 7 pages: verified title, date filter badge, select dropdown, date range text, action button, and absence of redundant date filter cards.
  - Verified dynamic preset updates and terms suppression in Purchase Order preview.

---

## 14. Delivery Challan Single-Line Header & Toolbar Placement Fix
- **Problem Resolved**:
  - In `delivery_challan`, the engine's `alignToolbarsNextToTotalTiles()` function previously mistook the header date filter's range font (`.font-mono`) as a summary tile, wrapping the entire page header and the search/export toolbar (`window.__erpTxnToolbar`) together inside a flex row (`erp-tile-toolbar-row`). This compressed the header width to ~676px, forcing the `+ Create Delivery Challan` button to wrap down to a second line next to `Search, Print, PDF, Excel`.
- **Implementation**:
  1. **Strict Single-Line Header Layout**:
     - Updated `Fd` component to enforce `flex items-center justify-between gap-3 pb-4 border-b border-slate-200 w-full overflow-x-auto` (removed `flex-wrap`).
     - Added `shrink-0` and compact spacing to custom date inputs (`From` and `To`) ensuring `Delivery Challans`, `Date Filter:`, `[Dropdown]`, `[From / To]`, `Range: ... to ...`, and `+ Create Delivery Challan` stay on **strictly one single line** (`offsetTop` alignment delta < 3px) across all presets.
  2. **Dedicated Search & Export Toolbar Row Below Filter**:
     - Placed `window.__erpTxnToolbar("delivery_challan", ...)` inside its own dedicated row (`erp-toolbar-row flex items-center justify-end w-full mb-1`) cleanly positioned **below the filter** and right-aligned directly above the table.
     - Hardened `alignToolbarsNextToTotalTiles()` in `erp-enterprise-engine.js` so it strictly ignores headers, filter bars, and elements with `h1, h2, select, border-b` or `Date Filter:`.
- **Verification & Testing**:
  - Syntax validated with `node --experimental-vm-modules` (0 errors).
  - Executed automated Headless Chrome CDP tests verifying `This Month` and `Custom Date` modes:
    - `btnTopVsTitleTop === -2` (strictly on the same horizontal line).
    - `toolbarRect.top > headerRowRect.bottom` (toolbar is positioned below the filter row).

---

## 15. Comprehensive Cash & Bank Statements and Date Filter Toolbar Layout
- **All Cash Entries in Cash In-Hand (`cash_in_hand`)**:
  - Added comprehensive multi-source aggregation for physical cash tracking:
    1. **Cash Drawer Adjustments**: Cash In (Add) and Cash Out (Reduce) counter floats with receipt vouchers.
    2. **Cash Payments In**: All customer payment receipts with `paymentMode: "Cash"` or `paymentType: "Cash"`.
    3. **Cash Sales Receipts**: Real-time cash receipts from Cash Sale Invoices (excluding amounts already receipted via `paymentsIn` to prevent double-counting).
    4. **Cash Bank Transfers**: Cash deposits to bank (`CASH_TO_BANK`) as outflows and withdrawals from bank (`BANK_TO_CASH`) as inflows.
    5. **Cash Payments Out**: Supplier settlements and vendor payments made in cash.
    6. **Cash Expenses**: Direct and indirect expense vouchers paid in cash (`s.expenses`).
    7. **Cash Purchases Paid**: Direct cash payments on purchase bills.
  - All entries sort chronologically by date with live Inflow and Outflow balance calculations.

- **All Bank Transactions in Corresponding Bank Account (`bank_accounts`)**:
  - Implemented multi-criteria bank transaction matching helper `__isBankTxn`:
    - Matches explicit `bankAccountId`, `toBankId`, or `fromBankId`.
    - Matches `accountName` or `bankName` against `paymentMode` or `paymentType`.
    - Routes transactions with generic bank payment modes (`"Bank"`, `"Online"`, `"UPI"`, `"Cheque"`, `"RTGS"`, `"NEFT"`, `"Card"`) lacking an explicit `bankAccountId` to the company's primary/default bank account to ensure zero transaction omissions.
  - Included all:
    1. **Bank Payments Received**: Customer collections via NEFT, RTGS, IMPS, Cheque, or UPI.
    2. **Bank Sales Receipts**: Sale invoices with immediate online or bank receipts.
    3. **Bank Transfers**: Inter-bank transfers (inflow/outflow) and cash deposits.
    4. **Bank Payments Out**: Supplier disbursements via bank transfer or cheque.
    5. **Bank Expenses**: Utility, rent, freight, and office expenses paid through bank accounts.
    6. **Bank Purchase Payments**: Purchase bills paid via bank modes.

- **Date Filter & Toolbar Layout**:
  - Updated `Fd` component when `title` (`h`) is null (used in Bank Accounts and Cash In-Hand):
    - Left side: Cleanly groups `Date Filter:`, `[Dropdown]`, `[From / To]` (if Custom Date), and `Range: DD/MM/YYYY to DD/MM/YYYY` adjacent to the filter.
    - Right side: Houses the Search, Print, PDF, and Excel toolbar (`window.__erpTxnToolbar`).
  - Search input dynamically filters the statement rows by type, voucher number, particulars, and amounts.

- **Verification & Testing**:
  - Automated Headless Chrome CDP tests (`scratch/test_bank_and_cash_browser.js`):
    - Verified `hasFilterCard: true`, `hasDateFilterBadge: true`, `hasRangeText: true`, `hasToolbarInCard: true`.
    - HDFC Bank Account statement: verified 3 rows (Payment Received ₹34,000, TNEB Expense ₹4,200, Rent Expense ₹25,000).
    - SBI Bank Account statement: verified payment to supplier (₹25,000).
    - Cash In-Hand statement: verified 3 rows (Cash Sale Receipt ₹14,000, Drawer Cash In ₹5,000, Transport Expense ₹3,800).
    - Verified live Search filtering on both Bank and Cash statements for specific payees and parties.
    - Full regression test suite (`scratch/run_cdp_tests.js`) passed 100% across all 7 transaction registers.

---

## 16. Unified Expenses Header & Dynamic Tile, Clean Account Titles, UBIT Pro ERP Rebranding, License Clean-up, and Standardized 7-Preset Calendar Engine
- **Expenses Page Unified Header & Dynamic Tile (`expenses`)**:
  - Re-architected `Expenses` (`sue`) page header to strictly match transaction registers:
    - Single top header line: `Expenses`, `Date Filter:`, `[Dropdown]`, `Range: DD/MM/YYYY to DD/MM/YYYY`, and `+ Add Expense` button.
    - Removed old banner with disconnected title bar and separate button.
    - Placed dynamic summary tile `Total Expenses` directly beneath in `erp-tile-toolbar-row` alongside the Search, Print, PDF, and Excel toolbar (`window.__erpTxnToolbar`).
    - Made summary tile total dynamically bound to the selected date range: `et = ml(expenses, "date", g, v, y); lt = et.reduce(...)`.
- **Underline Removed Across Financial Account Titles**:
  - Removed bottom dividing line (`border-b border-slate-200`) from:
    1. Bank Accounts (`bank_accounts`) list view header
    2. Bank Accounts (`bank_accounts`) statement detail header
    3. Cash In-Hand (`cash_in_hand`) statement header
    4. Cheques (`cheques`) header
    5. Loan Accounts (`loan_accounts`) header
- **Product Branding Change to "UBIT Pro ERP"**:
  - Replaced legacy "UBIT ERP GST Billing Software" with "UBIT Pro ERP" across:
    - Application `<title>` and HTML fallback containers in `index.html` and `GitHub/index.html`.
    - Multi-company selection portal banner in `assets/index-BmCd4CNB.js` and `GitHub/assets/index-BmCd4CNB.js`.
    - Top navigation brand display and computer-generated printable voucher footers.
- **Software License Version Removal**:
  - Removed "Version 1.0.1" (version label and version number) from the software license card in the sidebar.
- **Standardized 7-Preset Calendar Filter Engine**:
  - Standardized all calendar dropdown filters across all registers, expenses, and dashboard to exactly 7 options in order:
    1. `Today`
    2. `This Month`
    3. `Last Month`
    4. `Current Financial Year`
    5. `Last Financial Year`
    6. `All Time`
    7. `Custom Date`
  - Extended core date engine:
    - Added `All Time` date boundary calculation (`1970-01-01` to `2099-12-31`).
    - Updated comparison helper `aue` and filter helper `ml` to immediately return unfiltered records when `All Time` is selected.
    - Updated Dashboard chart metrics switch statement to handle `case "All Time":`.
- **Verification & Testing**:
  - Automated Headless Chrome CDP tests (`scratch/test_user_requests.js`):
    - Verified page title `"UBIT Pro ERP"` and top navbar title.
    - Verified software license section has no version text.
    - Verified all 7 presets present in correct sequence across Dashboard and Register dropdowns.
    - Verified Expenses header row, date range label, add button, and dynamic tile total updating from ₹ 0.00 (This Month) to ₹ 33,000.00 (Last Month / All Time).
    - Verified all 5 title containers have no bottom border.
  - Full transaction register suite (`scratch/run_cdp_tests.js`) passed 100% (7/7 tests passed).

---

## 17. Dynamic Summary Tiles Engine, "All Time" Company Inception Rule, Subtitle Clean-up, and Estimate / Proforma Date Filters
- **Dynamic Summary Tiles Engine Across All Registers (`gm`, `ml`, `Tje`)**:
  - Re-engineered summary tile calculation engine (`gm`) to dynamically compute totals based on the currently active date filters (`preset`, `customStart`, `customEnd`):
    - `__liveFiltered = useMemo(() => ml(items || [], dateField, preset, customStart, customEnd), [items, dateField, preset, customStart, customEnd])`
    - `__liveTotal = useMemo(() => __liveFiltered.reduce((sum, item) => sum + Number(item[amountField] || item.grandTotal || item.totalAmount || 0), 0), [__liveFiltered, amountField])`
    - Seamlessly updates `Total Sales`, `Total Purchases`, `Total Expenses`, `Total Sales Orders`, `Total Purchase Orders`, `Total Credit Notes`, `Total Debit Notes`, `Total Estimates`, and `Total Proformas` in real time whenever date presets or custom date ranges change.
- **"All Time" Company Inception Rule Across All Calendar Filters**:
  - Across all calendar filters everywhere in the app (sales, purchases, expenses, bank accounts, cash in hand, reports):
    - When `All Time` is selected, the start date is dynamically bound to the current company's creation date (`cmp.meta.createdAt` / `cmp.createdAt` / `cmp.createdDate`, defaulting to financial year inception `2026-04-01`), and the end date is strictly today's current date (`d(new Date())`).
    - Standardized range display: `Range: DD/MM/YYYY to DD/MM/YYYY` (from company inception to today's date).
    - Synchronized across `B9`, `aue`, and `ml` filtering helpers.
- **Financial Account Headers: Dividing Line Intact & Subtitles Removed**:
  - Restored bottom dividing border line (`border-b border-slate-200`) across all account headers:
    1. Bank Accounts (`bank_accounts` list view)
    2. Bank Accounts (`bank_accounts` statement detail view)
    3. Cash In-Hand (`cash_in_hand` statement view)
    4. Cheques (`cheques` PDC tracker view)
    5. Loan Accounts (`loan_accounts` facility view)
  - Completely removed the descriptive subtitle sentence (`<p class="text-xs text-slate-500">...`) directly under each title.
- **Unified Headers & Dynamic Date Filtering for Estimates & Proforma Invoices (`Tje`)**:
  - Integrated `Fd` header component into `Estimates & Quotations` and `Proforma Invoices`.
  - Added 7-preset calendar dropdown (`This Month`, `Last Month`, `All Time`, etc.) and real-time date range indicator.
  - Linked `ml` date filter to table records and summary tiles (`Total Estimates`, `Open Value`, `Converted to Sale`, `Total Proformas`, `Total Value`).
- **Automated Verification & Testing**:
  - Live Headless Chrome CDP tests (`scratch/test_all_user_fixes_final.js`, `scratch/test_presets_live.js`):
    - Verified "All Time" preset displays company inception to today (`Range: 01/04/2026 to 16/10/2026`).
    - Verified Sale Invoices tile dynamically shifts from `₹ 0.00` (This Month) to `₹ 33,600.00` (Last Month / All Time).
    - Verified all 4 account headers have `hasBorderBottom: true` and `hasSentence: false`.
    - Verified Estimates & Quotations and Proforma Invoices render unified `Fd` headers with 7-preset dropdowns and live dynamic tiles.

---

## 18. Cash In-Hand Single Line Alignment, Default Icon Colors Across Action Menus, and Colored Transaction Add Buttons
- **Cash In-Hand Single Straight Line Filter Layout (`Fd`, `cash_in_hand`)**:
  - Re-architected `Fd` filter toolbar container:
    - Updated container to `flex items-center justify-between gap-3 w-full flex-nowrap overflow-x-auto`.
    - Date Filter (`Date Filter:`, dropdown, and `Range: DD/MM/YYYY to DD/MM/YYYY`) locked to `flex items-center gap-2.5 shrink-0 flex-nowrap`.
    - Toolbar wrapper set to `shrink-0 ml-auto [&_.erp-txn-toolbar]:border-0 [&_.erp-txn-toolbar]:shadow-none [&_.erp-txn-toolbar]:bg-transparent [&_.erp-txn-toolbar]:p-0 [&_.erp-txn-toolbar]:self-center`.
    - Result: `Date Filter`, dropdown, date range, search input, print, PDF, and Excel buttons sit flush side-by-side on the exact same vertical line (`yDiff: 0px`, single straight line) without wrapping or nested inner border boxes.
- **Default Icon Colors Across Action Menus & Page Icons**:
  - Converted colored icons and action buttons across all pages to plain default neutral color (`text-black`, `hover:bg-slate-100`):
    - **Cash In-Hand**: View Voucher (`text-black`), Edit Entry (`text-black`), Delete Entry (`text-black`), Print Voucher (`text-black`).
    - **Expenses (`sue`)**: Preview (`text-black`), Edit (`text-black`), Print (`text-black`), Delete (`text-black`).
    - **Credit Notes**: Edit (`text-black`), Preview (`text-black`), Print (`text-black`), Delete (`text-black`).
    - **Debit Notes**: View (`text-black`), Edit (`text-black`), Preview (`text-black`), Print (`text-black`), Delete (`text-black`).
    - **Payment-In & Payment-Out**: Delete receipt / voucher buttons converted to neutral (`text-black hover:bg-slate-100`).
    - **3-Dots Action Dropdown Menu (`tr`)**: Cancel Invoice (`text-black hover:bg-slate-50`), Delete (`text-black hover:bg-slate-50`).
    - **Sidebar Submenus**: Removed `hover:text-emerald-400` from Record Payment-In and `hover:text-rose-400` from Record Payment-Out, standardizing to default `hover:text-white`.
- **Preserved Transaction Creation Buttons in Color**:
  - Explicitly kept full distinctive colors for:
    - `Convert to Sale` (`bg-emerald-600 hover:bg-emerald-500 text-white`)
    - `Convert to Purchase` (`bg-rose-600 hover:bg-rose-500 text-white`)
    - All `+Add / Record / Create` buttons (`+ Add Sale`, `+ Add Purchase`, `+ Add Order`, `+ Add Purchase Order`, `+ Add Debit Note`, `+ Add Credit Note`, `+ Add Delivery Challan`, `+ Add Expense`, `Record Payment-In`, `Record Payment-Out`, `Record Cash Entry`, `Transfer Cash to Bank`, `+ Add Bank Account`, etc.).
- **Automated Verification & Testing**:
  - Live Headless Chrome CDP tests (`scratch/test_cash_and_icons.js`, `scratch/test_menu_and_sidebar.js`):
    - Verified Cash In-Hand: `selectY: 433`, `searchY: 433`, `printY: 433`, `yDiff: 0`, `isSingleLine: true`.
    - Verified sidebar buttons: `payInClass: "hover:text-white p-0.5"`.
    - Verified transaction add buttons: `Add Sale` retains `bg-rose-600 / bg-emerald-600`.



## 19. Enterprise Suite Update: License Date Engine, Google Auth Modal, Backup System, Bulk Item Update, Recycle Bin, Dual Prefix/Suffix, User Access Control, Black Tiles, and Complete Accounting Suite
- **Software License Date Engine**:
  - Re-architected dynamic license date evaluator in sidebar:
    - **Demo User**: Displays today's current date (`DD/MM/YYYY`).
    - **New User Accounts**: Automatically assigns a 7-day trial validity period (`createdAt + 7 days`) formatted as `DD/MM/YYYY` ("just show the date").
    - **Activated User**: Displays updated license expiration date (`licenseValidUntil` / `expiryDate`).
    - Removed version and version number from the software license card.
- **Google Sign-In Native Account Selector Modal**:
  - Replaced native browser `prompt()` with an interactive Google Authentication Modal:
    - Lists detected Google accounts on the user's PC with quick-select radio pills.
    - Provides a manual typing field for alternative Google accounts.
    - Displays software branding ("UBIT Pro ERP") and basic product information.
    - Action buttons: "Sign In" and "Sign Up".
    - Security note footer: *"Your details are safe and secure as per Google Firebase"*.
- **Backup Page Overhaul & Real-Time Sync Card Removal**:
  - Renamed sidebar menu and page heading from "Google Drive & Local Backup" to **"Backup"**.
  - Completely removed the "Multi-Device Real-Time Syncing" dark card with QR code from the DOM.
  - **Google Drive Backup**: Validates connection; if disconnected, displays connection popup modal; if connected, executes sync and notifies with toast: *"Google Drive Sync Completed"* (or *"Google Drive Sync Failed"* on error).
  - **Local Backup**: Displays popup to select folder and save backup to user's local PC.
- **Data Import & Export Center**:
  - Removed "Download Sample Template" buttons from both "Import Party" and "Import Items".
  - Implemented live functional handlers for all four modules:
    1. *Import Party*: File upload parser (CSV/JSON) mapping name, phone, GSTIN, address, and balances directly into company parties.
    2. *Import Items*: File upload parser (CSV/JSON) mapping product names, HSN, purchase prices, sales prices, MRP, and GST rates into the item catalog.
    3. *Export Sales & Purchases*: 1-click CSV download generator for sales and purchase transactions.
    4. *Full JSON Database Backup*: 1-click snapshot generator downloading complete company state.
- **Bulk Item Update (`bulk_update`)**:
  - Created `UbitBulkUpdateView` with full 9-column interactive editing table:
    - `# | Code | Item Name | HSN/SAN | MRP | Purchase Cost | Sale Cost | GST% | Action`
    - Live editable inputs for Code, Name, HSN/SAC, MRP, Purchase Cost, and Sale Cost.
    - GST% selector with standard rates (0%, 0.1%, 0.25%, 3%, 5%, 12%, 18%, 28%) plus manual typing option.
    - Action Column: Save button (neutral black) and Delete button (neutral black).
    - Saving an item changes the Save icon to a green tick mark (`✓`); editing any field automatically reverts it back to the Save icon.
    - Top "Save Bulk Changes" button saves all modified items simultaneously.
    - **Historical Integrity**: Catalog updates apply exclusively to new transactions; historical invoices and bills preserve their original line item records.
- **Recycle Bin & Data Recovery (`recycle_bin`)**:
  - Created `UbitRecycleBinView` rendering all deleted invoices, bills, orders, parties, and items.
  - Displays record type, record number/document number, name, amount, and deletion timestamp.
  - Provides "↺ Restore" (re-inserting records back to their source collections) and "Delete Permanently" actions.
  - Top "Empty Recycle Bin" button with confirmation.
- **Invoice Designer Dual Prefix & Suffix**:
  - Re-ordered document series so `Sale` and `Sale Order` appear first.
  - Re-architected Prefixes and Suffixes containers from single-column lists to a 2-column side-by-side grid (`grid grid-cols-1 sm:grid-cols-2 gap-4`).
- **User Management & Granular Access Control**:
  - Set default state for new companies to display only the admin user.
  - Enhanced user creation modal with base role presets: `Admin`, `Salesman`, `Accountant`, `General`, and `Custom`.
  - Added custom Role Name input field.
  - Added granular Menu & Submenu Access Control with "Grant All" and "Revoke All" actions.
- **All Summary Tiles Text Default Black**:
  - Standardized all text, labels, and numeric totals in summary tiles across all pages (Dashboard, Sales, Purchases, Expenses, Bank, Cash In-Hand, Cheques, Loans, and Reports) to default black (`text-black` / `#000000`).
  - Preserved color exclusively for percentage pills and status badges.
- **Complete Accounting Suite Rework & Reports**:
  - Reworked `lbe` component into a comprehensive accounting engine with 9 dedicated modules:
    1. **Sundry Debtors Statement (Receivables)**: Debtor party list, billed amounts, receipts, closing balances, and status.
    2. **Sundry Creditors Statement (Payables)**: Creditor vendor list, billed amounts, payments made, closing liabilities, and status.
    3. **All Parties Statement**: Consolidated party ledger with 1-Click Batch Download ("Download All Party Statements"), 7-preset calendar filter, live search, print, PDF, and Excel export.
    4. **Trial Balance**: Debit and credit ledger balances for all accounts with balanced totals.
    5. **Profit & Loss Statement (P&L)**: Revenue from operations, direct/indirect expenses, gross profit, and net profit.
    6. **Balance Sheet**: Assets (current, cash, bank, receivables, inventory) vs Liabilities & Equity (payables, capital) with balance indicator.
    7. **Expense Report**: Category-wise expense distribution, payment modes, vendor references, and grand totals.
    8. **Cash Flow Statement**: Inflows and outflows across operations, sales collections, and supplier payouts.
    9. **Export to Tally**: Tally-compatible XML voucher generator and CSV ledger exports.
- **Automated Verification & Testing**:
  - Executed Chrome CDP test suite verifying zero syntax errors, clean bundle compilation, active accounting submenus, modal triggers, and UI layout responsiveness.
