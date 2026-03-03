# Microsoft Defensive Cloud Atlas — v1.0

###
An interactive reference for Azure & Microsoft 365 log sources, license requirements, retention periods, and role-based access.
This was built to understand and visualize the different data sources, detection and response capabilities for aspiring security learners.
####
---

<h3 align="center">
  <a href="[https://ironbranded.github.io/CAD-Breach-Cost-Simulator](https://github.com/IronBranded/Microsoft-Defensive-Cloud-Atlas)/" target="_blank" rel="noopener noreferrer">
    🟢 LAUNCH THE ATLAS 🟢
  </a>
</h3>

---

## What is this for?

The Microsoft Defensive Cloud Atlas is an offline-capable HTML reference tool designed for security practitioners working across the Microsoft cloud stack. It maps every significant log source across Azure, Entra ID, Microsoft 365, Defender XDR, Microsoft Sentinel, and Microsoft Purview and ties each one to the license required to access it.

The license filter panel lets you select your actual licensing posture and instantly see which log sources are available to you, which are locked, and which are automatically unlocked as part of a bundle.

---

## Features

### License Scope Panel
Select your licensing posture from the top panel. Every licence toggle supports three states:

| State | Appearance | Meaning |
|---|---|---|
| Unselected | Grey, no border | Not licensed |
| **Selected** | Group colour (blue / orange / purple / cyan / teal) with solid glow | Directly licensed — you clicked it |
| **Included** | Amber / gold with dashed border and `INC` badge | Automatically unlocked as part of your selected bundle |

Selecting a bundle licence (e.g. **M365 E5**) will immediately highlight every component it includes in amber — so you can see at a glance what you're getting without consulting Microsoft's documentation.

### Supported Licence Tiers

**Microsoft 365 Enterprise:** F1, F3, E3, E5  
**Microsoft 365 Business:** Basic, Standard, Premium  
**Office 365:** E1, E3, E5  
**Defender XDR:** MDE P1, MDE P2, MDO P1, MDO P2, MDI, MDCA, E5 Security, Defender for Cloud  
**Microsoft Sentinel:** Sentinel, Free Connectors  
**Azure / Entra ID:** Azure Free, Entra P1, Entra P2  
**Microsoft Purview:** Compliance (E3), E5 Compliance, Advanced Audit, Info Protection P1/P2, Insider Risk Management, eDiscovery Premium  

### Log Source Coverage

| Section | Description |
|---|---|
| **Azure** | Activity Logs, Firewall, NSG Flow, Storage, Key Vault, Defender for Cloud, VM event logs |
| **Entra ID** | Sign-in logs, Audit logs, Conditional Access, Risky Users/Sign-ins, Identity Protection, PIM |
| **Microsoft 365** | Unified Audit Log (UAL), Exchange, SharePoint, Teams, OneDrive, Power Platform |
| **Defender XDR** | MDE device/alert/hunting, MDO email, MDI identity alerts, MDCA, Advanced Hunting |
| **Microsoft Sentinel** | Analytics, Incidents, Watchlists, UEBA, Hunting queries, Free data connectors |
| **Microsoft Purview** | UAL Standard/Premium, eDiscovery, DLP, Sensitivity Labels, Insider Risk, Communication Compliance |

Each log source entry includes: license requirement, DFIR value, retention period, portal location, KQL table names, key fields, critical event IDs, and common threat signals.

### Dynamic Filtering
When licences are selected, every log source, category counter, overview stat, and coverage percentage updates in real time. Locked sources are visually dimmed. Section headers show an `X/Y sources (Z locked)` badge.

### Roles & Access Page
50+ role definitions across the full Microsoft cloud stack, each tagged with scope and flagged as DFIR-critical where relevant. Includes: Security Reader, Security Operator, Global Reader, Compliance Administrator, eDiscovery Administrator, Sentinel Contributor, and more.

### Retention Reference
A consolidated table of default and maximum retention periods across all services — covering Entra sign-in logs (7/30 days), UAL standard/premium (90/180 days), MDE (30-day hard cap), Message Trace (90-day cap), Exchange (unlimited with hold), Sentinel (configurable + archive tier), and more.

### Printable Executive Summary
The **Executive Summary** button (top right) generates a print-ready modal containing:
- Active licence scope with colour-coded badges
- Coverage summary statistics
- Log source coverage by category with percentages
- Coverage gaps and risk ratings based on missing licences
- Immediate preservation checklist for DFIR response
- Key retention reminders

Use your browser's **Print → Save as PDF** to produce a clean stakeholder-ready document.

---

## Bundle Logic Reference

| Licence Selected | Key Inclusions (shown in amber) |
|---|---|
| M365 E5 | E3, F1, Entra P1+P2, MDE P1+P2, MDO P1+P2, MDI, MDCA, E5 Security, full Purview E5 |
| M365 E3 | F1, Entra P1, MDE P1, Purview Std, MIP P1 |
| M365 Business Premium | Entra P1, MDE P1, Purview Std, MIP P1 |
| M365 F3 | F1, Entra P1, Purview Std |
| Office 365 E5 | MDO P1+P2, Advanced Audit, eDiscovery Premium |
| E5 Security (Defender bundle) | MDE P1+P2, MDO P1+P2, MDI, MDCA |
| Purview E5 Compliance | Advanced Audit, IP P1+P2, IRM, eDiscovery Premium |
| Entra P2 | Entra P1, Azure Free |
| MDE P2 | MDE P1 |
| MDO P2 | MDO P1 |

---

## Usage

This is a **single self-contained HTML file** with no external dependencies beyond Google Fonts (loaded at runtime for display purposes — works offline with system fonts as fallback).

1. Open `microsoft-defensive-cloud-atlas-v1.html` in any modern browser
2. Select your licensing posture in the panel at the top
3. Navigate between sections using the top navigation bar
4. Use the search bar within each section to filter log sources
5. Click any log source card to expand full detail
6. Use **Executive Summary** to generate and print a stakeholder report

No server required. No installation. No data leaves your machine.

---

## Intended Audience

- Incident Responders and DFIR analysts working Microsoft cloud environments
- SOC Analysts scoping investigation capabilities before an engagement
- Security Architects mapping licensing posture to detection coverage
- Compliance Officers assessing audit log availability
- Pen Testers and Red Teamers understanding defensive visibility

---

## Caveats & Disclaimer

- License inclusions and feature availability are based on Microsoft service descriptions and licensing documentation as of **March 2026**. Microsoft regularly updates what is included in each SKU. *ALWAYS* verify against current Microsoft documentation before making procurement decisions.
- Retention periods are defaults. Many can be extended via policy (Legal Hold, Audit Retention Policy, Sentinel archive tier). Some have hard caps that cannot be extended.
- This tool does not constitute legal or compliance advice.
- Sentinel is **not included** in any M365 or O365 bundle. It is always a separate billable workspace.
- Defender for Cloud (MDFC) is Azure-native and separately licensed from Defender XDR.

---

## Version History

| Version | Date | Notes |
|---|---|---|
| v1.0 | March 2026 | Initial release. Full Azure, Entra, M365, Defender XDR, Sentinel, Purview coverage. Bundle inclusion highlighting. Printable Executive Summary. |

---

*Microsoft Defensive Cloud Atlas is an independent reference tool and is not affiliated with or endorsed by Microsoft Corporation. All product names are trademarks of their respective owners.*
