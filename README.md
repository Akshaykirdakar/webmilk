# Milk Billing System – Web version

Web conversion of the VB6 program in `D:\dairy\milk billing` (CDO.vbp). It uses the **same Oracle XE 11g
database (schema `bgk`)** and the same stored procedures, so the VB program and the web version can both be used
on the same data during the change-over.

```
webmilk\
  backend\                      ASP.NET Core 8 Web API (C#)
    MilkBilling.Api\            the API project (Controllers, Data, appsettings.json)
    database\                   SQL maintenance script
  frontend\                     web pages (HTML / CSS / JavaScript, no build step)
    css\  js\  fonts\  img\
  tools\genforms.js             regenerates frontend\js\vbforms.js: every VB form's layout (position, size,
                                font, font size, colours, TabIndex, ListView columns) read from the .frm files
  tools\genlabels.js            regenerates frontend\js\labels.js (Marathi captions) from the .frm files
  tools\genfonts.js             copies the DVB fonts used by the forms and writes frontend\css\fonts.css
  tools\frximg.js               extracts pictures (logon, MDI background) from .frx files

The web screens are drawn from vbforms.js, so they look and behave like the VB forms: same positions and
sizes, same fonts and font sizes, Enter / arrow keys move by TabIndex, same New / Find / Change / Save /
Cancel / Delete / Close flow, and reports open inside Frame2 like the Crystal viewer. If a .frm is changed,
run `node tools\genforms.js` again.
  run-webmilk.bat               start for daily use / testing
  publish-webmilk.bat           build a deployable copy into webmilk\deploy
```

## Requirements (server PC)

* Oracle XE 11g running (service `OracleServiceXE`, listener on port 1521). The 32-bit edition is fine: the API uses
  the fully managed Oracle driver (`Oracle.ManagedDataAccess.Core`), so **no Oracle client / ODBC / MSDAORA is needed**.
* .NET 8 runtime (ASP.NET Core) – already installed on this PC. A copy made with `publish-webmilk.bat` is
  self-contained and needs nothing.
* Clients: any modern browser (Chrome / Edge). Nothing to install.

## First-time setup

1. Database objects: after restoring a backup the milk procedures are left INVALID. Recompile once:
   ```
   sqlplus bgk/bgk@XE @D:\dairy\webmilk\backend\database\01_recompile_objects.sql
   ```
   (Already done on this PC.)
2. Check `backend\MilkBilling.Api\appsettings.json`:
   * `ConnectionStrings:Oracle` – `User Id=bgk;Password=bgk;Data Source=localhost:1521/XE`
   * `Auth:Users` – login users. **Change the default `admin` / `admin@123` password.** Add more users as needed.
   * `Auth:JwtKey` – secret used to sign logins; change it to any long random text.
   * `Anudan:*` – fixed texts used in the Anudan Excel formats (union, dairy, taluka, bank, IFSC).
   * `Kestrel:Endpoints:Http:Url` – port (default 5080).
3. Start: double-click `run-webmilk.bat`, then open **http://localhost:5080** (other PCs: `http://<server-ip>:5080`;
   allow port 5080 in Windows Firewall).

## Installing on another computer (database already there)

`powershell -ExecutionPolicy Bypass -File make-package.ps1` builds `deploy\MilkBilling` and `deploy\MilkBilling.zip`:
self-contained server (`app\`, no .NET needed, with Ghostscript in `app\gs`), pages, the DVB fonts used by the
reports (`fonts\`), `database\01_recompile_objects.sql`, and `install.bat` / `install.ps1`. On the new computer:
extract the zip to a fixed folder (e.g. `D:\MilkBilling`), right-click `install.bat` > Run as administrator. It checks
Oracle / Crystal 8.5 / TNS `bgkdata` / fonts, recompiles the procedures, opens port 5080, creates the desktop icon and
a Startup entry that starts the server with Windows. Steps in Marathi: `INSTALL-MARATHI.txt`. Sources for the
installer files are in `package\`.

## Production deployment

Run `publish-webmilk.bat` → `deploy\backend` + `deploy\frontend`. Then either

* **Windows service** (recommended):
  ```
  sc create MilkBillingApi binPath= "D:\dairy\webmilk\deploy\backend\MilkBilling.Api.exe" start= auto
  sc start MilkBillingApi
  ```
* or **IIS**: install the *ASP.NET Core Hosting Bundle 8*, create a site pointing to `deploy\backend`.
  The frontend can also be hosted separately (any web server / IIS site on `deploy\frontend`); then set
  `apiBase` in `frontend\js\config.js` to the API address and list the frontend address in `Cors:Origins`.

## Reports open at once (drawn in the page)

The reports are drawn in the browser (`frontend\js\rptengine.js`) from the design of the original .rpt files: sections,
positions, fonts, lines, formulas, groups, summaries and running totals. `/api/fast/...` runs the same procedures and views
as before and sends the rows; Print uses the browser (A4, page by page). If a .rpt is changed, run `tools\rptdump.ps1`
(32-bit PowerShell, one process per report) for it into `tools\rptjson`, then `node tools\genrptdefs.js`.
What the runtime does not hand out (conditional formulas, fields inside a text) is listed in `OVER` in rptengine.js.
The Crystal route (`/api/crystal/...`, below) stays in the program as a fallback.

## Reports = your original Crystal Reports

The report Print buttons print the **original .rpt files** (copied to `backend\MilkBilling.Api\reports`) with the
same Crystal Reports 8.5 engine the VB program used, so layout, boxes, fonts and formulas are exactly as before.
The API runs the same procedures / views first (milk_rate_proc, milk_ledger_proc, VW_BILL_DETAIL2 ...), prints the
report to PDF (`crystal\crexport.ps1`, 32-bit PowerShell), embeds the DVB Marathi fonts with Ghostscript
(`crystal\Fontmap`, made by `tools\genfontmap.js`) and shows it inside the form's Frame2 (Print / Open / Close).
Needed on the **server** PC only (all already present here): Crystal Reports 8.5 runtime, 32-bit Oracle client with
TNS names `bgkdata` / `vsisugar`, Ghostscript (`Crystal:Ghostscript` in appsettings.json).

## Full screen

* Forms are scaled automatically to fill the screen (no scrolling), like a maximized VB window.
* Pressing **Login** switches the browser to full screen (F11 toggles; the ⛶ button in the menu bar too).
* `Milk-Billing.bat` / `make-desktop-shortcut.ps1` open the program as a full-screen app window without address
  bar or tabs. On the server PC the desktop icon runs `start-milkbilling.ps1`: if the server is not running it is
  started first (minimized `MilkBilling.Api` window, built Release copy in `bin\Release\net8.0`) and the program
  opens when it answers. Close that window to stop the server. After changing the C# code run
  `dotnet build -c Release` (or `run-webmilk.bat` once) so the icon uses the new version. On other PCs: `powershell -ExecutionPolicy Bypass -File make-desktop-shortcut.ps1 -Server http://<server-ip>:5080`

## Closing the program

**Close** on the login form and **Exit** in the menu end the program like VB (`Unload Me` / `End`): the user is
signed out and the window closes. Moving between forms adds no browser history, so the browser allows the page to
close its window (always works when started from `Milk-Billing.bat` / the desktop shortcut). If a browser still
refuses (e.g. a tab opened by hand after visiting other sites), an end screen appears: close it with Alt+F4 / Ctrl+W.

## Mobile phones

Open `http://<server-ip>:5080` in Chrome on the phone (same Wi-Fi / network as the server; port 5080 allowed in the
server's firewall). On screens narrower than 760 px the VB forms are re-flowed into rows: each line of the VB form
(caption + box) becomes one full-width line with large touch boxes, frames become sections, lists come after the
entry fields. Same controls, captions, TabIndex order and behaviour. Reports are shown as page images (pinch to
zoom) with an **Open PDF** button for printing / sharing. Turning the phone sideways or using a tablet / PC (wider
than 760 px) shows the original VB form layout.
On the phone: a menu closes as soon as an item is tapped; the box being typed in is scrolled above the on-screen
keyboard; one tap on a ListView row loads the record (= VB double click); in the name combo you can type the code,
the English name, or the Marathi name with the phone's normal Marathi keyboard (`js\dvbsearch.js` matches the
Unicode letters typed against the DVB-encoded names by their consonants, so सागर finds सागर राजेंद्र ननवरे).

## SMS after a milk entry

When a milk entry is saved, the supplier gets an SMS (date, shift, code, litre, fat, SNF, rate, amount) from the SIM of a
data-entry phone. A browser cannot send SMS, so the phones use the small app in `android\` (`bash android/build.sh` makes
`MilkBilling.apk`; a copy in `frontend\` can be downloaded from `http://server:5080/MilkBilling.apk`; Android only).
The app shows this same program and sends the messages waiting in MILK_SMS_QUEUE (`SmsController`). The phone that made
the entry goes first; a phone that reached its daily limit or is off leaves its messages to another phone.
The Daily Milk Collection form asks once whether to send, then its **Auto SMS** button turns it on and off. Limit, test number
(all SMS go only to it), phones and messages are in Transactions > SMS Status. Messages older than 12 hours are not sent.

## Marathi text

Names and captions in this database are stored in the **DVB-TT (ISM) font encoding**, exactly as the VB program
typed them – not Unicode. The web pages therefore show them with the same fonts (`frontend\fonts`, copied from
`C:\Windows\Fonts`: DVBW-TTSurekh, DVB-TTYogesh, DVBW-TTBhima), so existing data looks identical and nothing in
the database had to be converted. To **type** Marathi (supplier name, item name, narration) use the ISM keyboard
(Scroll Lock) on the client PC as before; English fields (English name, bank, village, IFSC) are normal text.
The fonts are C-DAC ISM fonts licensed with your ISM installation; they are served only to your own users.

## Screen mapping (VB form → web)

| Menu | VB form | Web page | Tables / procedures |
|---|---|---|---|
| Login | cab_Logon | login page | users in appsettings.json |
| Working date | HT_setup | dialog after login, *Change Date* button | MILK_FORTNIGHT |
| Fortnight | frmstudent_subject | Master › Fortnight | MILK_FORTNIGHT |
| Milk Supplier Master | frmCDO_MAIN_YOJANA_MASTER | Master › Milk Supplier Master (incl. tag nos.) | MILK_SUPPLIER, ANUDAN_TAG_MASTER |
| Deduction / Item / Bank / Village Master | frmDEDUCTION_MASTER, FRMDIS_PRODUCT_MASTER, FRMbank_MASTER, FRMvillage_MASTER | Master › … | MILK_DEDUCTION_MASTER, MILK_ITEM_MASTER, MILK_BANK_MASTER, MILK_VILLAGE_MASTER |
| Daily Milk Collection | frmstudent_subject_MASTER | Transactions › Daily Milk Collection | MILK_INPUT, MILK_FAT_SNF_RATE_MASTER |
| Cattle Feed Purchase | frm_item_DEDUCTION_purch | Transactions › Cattle Feed Purchase | MILK_ITEM_PURCHASE |
| Deduction | frm_milk_DEDUCTION | Transactions › Deduction | MILK_DEDUCTION_2, MILK_CATTEL_FEED_BALANCE |
| Deduction Cash Jama | frm_milk_DEDUCTION_jama | Transactions › Deduction Cash Jama | MILK_DEDUCTION_JAMA |
| Deduction Adj. | frm_milk_DEDUCTION_adj | Transactions › Deduction Adj. | MILK_DED_ADJ, MILK_BILL_HEADER |
| Bill / Bonus / Anudan process | frm_milk_bill_proc, frm_milk_bonus_proc, frm_milk_bill_anudan | Transactions › … | milk_bill_proc2, milk_bonus_proc2, milk_bill_proc_anudan |
| Backup | frmbackup | Transactions › Backup (ZIP of CSV files) | all MILK_* tables |
| Daily report | repo_milk_daily | Reports › Daily Report | milk_rate_proc, MILK_INPUT |
| Milk Bill | repo_milk_Bill | Reports › Milk Bill | MILK_BILL_HEADER / DETAIL |
| Bill Register | repo_milk_Bill_reg | Reports › Bill Register (register, bank list, cash list, bank letter, pendrive Excel all/cow/buffalo) | MILK_BILL_HEADER |
| Bill summary | repo_milk_Bill_summary | Reports › Bill Summary (date-wise, cow, buffalo, Shivamrut, total) | MILK_BILL_DETAIL, milk_shiv_proc |
| Ledger | repo_milk_ledger | Reports › Ledger (ledger, receivable/payable list, feed purchase & issue) | milk_ledger_proc, milk_cattel_proc |
| Rate charts (4) | repo_rate_chart, …anudan, …anudan9.0, …buffalo | Reports › Rate Chart … | milk_rate_chart, milk_rate_chartanu, milk_rate_chartanu9, milk_rate_chart_b |
| Master List | repo_chk_llist | Reports › Master List | – |
| Anudan reports | repo_milk_Bill_anudan | Reports › Anudan Reports (Excel_1/2/3) | milk_adjust_proc, MILK_BILL_HEADER_ANUDAN |
| SMS | repo_milk_sms | Reports › SMS (Excel_1, Backup) | MILK_INPUT |

Crystal Reports (`reports\*.rpt`) are replaced by printable A4 HTML pages (Print button → printer or "Save as PDF").
Excel exports are downloaded as `.xlsx` instead of being saved to drive C:/F:/H:.

## Differences from the VB program (deliberate)

* Real login (the VB login check was commented out – every user was administrator).
* No `CREATE OR REPLACE VIEW` at run time (MILK_NON_CODE, VW_BANK_LIST, vw_bill_detail…): the same queries are run
  directly, so several users can work at the same time. Reports that use the shared scratch tables
  (MILK_LEDGER_OP, MILK_BILL_HEADER_ANUDAN) are serialised on the server.
* Milk entry: the server recalculates rate and amount and refuses to save when no rate exists for the fat/SNF
  (VB saved such entries with rate 0), and a duplicate supplier/date/shift entry gives a clear message.
* A supplier that already has milk entries or bills cannot be deleted.
* Rate chart Cow 9.0 (`milk_rate_chartanu9`, `backend\database\02_rate_chart_fix.sql`; old version in
  `backup_rate_procs_before_20261106.sql`): same rates as before, but saved in one transaction, a chart may not run
  into the next chart of the dairy, and empty or negative values are refused. `milk_rate_proc` uses the supplier's own
  dairy and leaves entries that are already billed unchanged.
* Rate chart Cow 9.0 form: four numbers (basic rate 3.5/8.5 and the differences 9.0-8.5, 8.0-7.0, 3.6-5.5); the other
  differences are under More, the other rates are calculated. A new chart starts from the dairy's last chart, the day
  after it ends. Process shows the whole chart first (Save / Cancel). Print draws the saved chart at once on one A4 landscape page
  (no Crystal report; `milk_rate_chart9.rpt` is no longer used by this form).
* Ledger (`milk_ledger_proc`, `backend\database\03_ledger_same_calc.sql`): one calculation for one supplier and for all
  suppliers. VB had two: for all suppliers the opening balance left out cash jama and took the From date into the opening.
* Fixed VB bugs: Item master delete used a wrong column; the Bonus bill process menu pointed to a non-existent form;
  `milk_adjust_proc` was called with a missing bracket.
* Hidden VB menu items (Rate Master, Udaynagar Milk Entry, Shivamrut Slip Entry, semester fee …) and the unused
  student/CDO forms left in the project were not converted.
* The bill views (VW_BILL_DETAIL / VW_BILL_DETAIL2) are rebuilt for the chosen fortnight before every report that
  uses them (VB rebuilt them only in the Milk Bill form, so Bill summary could show the previously printed fortnight).
* Daily report: if milk_rate_proc fails (ORA-01427 – both dairies have a rate for the same fat/SNF) the report
  is still printed with the stored rates.
* The User Name / Password boxes of the logon form (hidden in VB, which logged in automatically) are shown.
