# Project TODO

- [x] Hebrew RTL layout and global theming (clean, functional design)
- [x] File upload interface with drag-and-drop for PDF policies
- [x] Uploaded files list with name, size, and status indicators
- [x] Backend: PDF upload endpoint with S3 storage
- [x] Backend: PDF text extraction with Hebrew support (via LLM file_url)
- [x] Backend: AI analysis endpoint using LLM for structured coverage extraction
- [x] Backend: Q&A chat endpoint using LLM with policy context
- [x] Interactive dashboard with coverage cards/widgets
- [x] Coverage card expansion (modal/accordion) with eligibility, co-pay, limits, exclusions
- [x] Financial summary section (premiums, total coverages, fine print)
- [x] Q&A chatbot interface for natural language questions about policies
- [x] No authentication required - open access MVP
- [x] Vitest tests for backend procedures
- [x] Fix: empty SET clause in updateAnalysisStatus causing SQL error on analyze

## Phase 2: Authentication & User Management

- [x] Update database schema: add userId to analyses table, add user profile fields
- [x] Create migration for schema changes
- [ ] Add signup endpoint (email/password)
- [ ] Add login endpoint (email/password)
- [x] Integrate Google OAuth (already available in template)
- [ ] Create user profile update procedure
- [x] Create get user analyses procedure

## Phase 3: Personal Dashboard & Profile

- [x] Build user profile page with personal details
- [x] Build personal dashboard showing all user's analyses
- [x] Add ability to view/reopen previous analyses
- [x] Add ability to delete analyses

## Phase 4: Smart Navigation & File Management

- [x] Implement smart home page (first-time vs returning user detection)
- [x] Add "Add files" button to all pages (via header navigation)
- [x] Implement persistent analysis viewing with direct links (/analysis/:sessionId)
- [x] Update upload flow to attach to logged-in user
- [x] Add navigation header with user menu

## Phase 5: Testing & Polish

- [ ] Write tests for auth procedures
- [ ] Write tests for user dashboard procedures
- [ ] Manual testing of full flow
- [ ] Fix any bugs

## Bugs to Fix

- [x] Fix: After logout, redirect to Manus login page using redirectOnUnauthenticated
- [x] Fix: Remove User ID field from profile page
- [x] Fix: Remove Role field from profile page
- [x] Fix: Add text-right alignment to DetailRow in CoverageCards for proper RTL display
- [x] Fix: AI response text in chatbot not aligned to right (RTL)

## Phase 5: RTL Improvements & UX Enhancements

- [x] Fix: Bullet points in chatbot responses start from left instead of right (RTL)
- [x] Fix: Bullet points in coverage details not aligned to right
- [x] Feature: Separate policy names component (display list of policies separately)
- [x] Feature: Add file source to each coverage card (which PDF it came from)
- [x] Feature: Improve "לא צוין בפוליסה" messaging to be clearer
- [x] Feature: Add coverage filtering/search by coverage name
- [ ] Feature: Update financial summary to use new policy names component

## Phase 6: File Filtering

- [x] Feature: Display file names as clickable badges instead of comma-separated list
- [x] Feature: Filter coverages by selected file when badge is clicked
- [x] Feature: Show "all files" option to view all coverages
- [x] Fix: Replace comma-separated policy names in main card with clickable PDF badge components that filter coverages

## Phase 7: Billing & Gemini Integration

- [ ] DB: Add api_usage_logs table (userId, sessionId, tokens, costUsd, createdAt)
- [ ] DB: Add billing_customers table (userId, twoCheckoutCustomerId, paymentMethodAdded)
- [ ] DB: Add billing_events table (userId, amountUsd, status, description, createdAt)
- [ ] Switch LLM from Manus Forge to Google Gemini API (secure server-side only)
- [ ] Add GEMINI_API_KEY secret via webdev_request_secrets
- [ ] Integrate 2Checkout SDK for customer creation and charging
- [ ] Add 2CHECKOUT_SELLER_ID and 2CHECKOUT_SECRET_KEY secrets
- [ ] Track token usage per analysis and chat request
- [ ] Charge user via 2Checkout after each analysis
- [ ] Build billing dashboard page for users (usage history, costs)
- [ ] Add payment method setup flow (2Checkout hosted page)
- [ ] Block analysis if no payment method on file

## Phase 8: Usage Tracking & Admin Dashboard

- [x] DB: Add api_usage_logs table (userId, sessionId, action, promptTokens, completionTokens, totalTokens, costUsd, createdAt)
- [x] Backend: Track tokens after every invokeLLM call (analyze + chat)
- [x] Backend: Add admin procedures (getAllUsers, getAllUsageStats, getUserDetail)
- [x] Backend: Add user procedures (getMyUsage, getMyStats)
- [x] Frontend: Build Admin Dashboard page (admin-only, role check)
- [x] Frontend: Admin stats cards (total users, active users, total analyses, total cost)
- [x] Frontend: Admin users table (name, email, join date, analyses count, tokens, cost)
- [x] Frontend: Admin usage chart (analyses per day/week)
- [x] Frontend: Build User Usage page (personal history)
- [x] Frontend: Add admin link in header for admin users
- [x] Frontend: Route guard for /admin (redirect non-admins)

## Phase 9: Gmail Integration & Smart Invoice Extraction

- [x] DB: Add gmail_connections table (userId, accessToken, refreshToken, lastSyncedAt, encryptedAt)
- [x] DB: Add smart_invoices table (userId, source, provider, amount, currency, date, dueDate, status, rawData, createdAt)
- [x] Backend: Implement Gmail OAuth flow (login, callback, token storage with encryption)
- [x] Backend: Implement Gmail token refresh logic (when token expires)
- [x] Backend: Build email scanning procedure (fetch last 7 days, filter by keywords)
- [x] Backend: Implement provider detection (בזק, סלקום, חברת החשמל, עיריות, ביטוח וכו')
- [x] Backend: Extract invoice data from emails (PDF + text body parsing with AI)
- [x] Backend: Store extracted invoices in smart_invoices table
- [x] Backend: Implement on-demand scan endpoint (user clicks "סרוק עכשיו")
- [x] Frontend: Build "Connect Gmail" page with OAuth flow
- [x] Frontend: Display Gmail connection status in settings
- [x] Frontend: Add "Scan Now" button to trigger manual email scan
- [x] Frontend: Build "Smart Invoices" dashboard showing extracted invoices
- [x] Frontend: Display invoice cards with provider, amount, date, status
- [x] Backend: Implement insights engine (compare to previous month, detect anomalies)
- [x] Frontend: Display insights (price increase alerts, duplicate charges, etc.)
- [x] Backend: Write tests for Gmail OAuth flow
- [x] Backend: Write tests for email scanning and parsing
- [x] Backend: Write tests for invoice extraction

## Bug Fixes: Gmail OAuth Callback

- [x] Fix: Gmail OAuth callback returned to /smart-invoices page instead of completing connection
- [x] Fix: Added server-side /api/gmail/callback route to handle code exchange without session dependency
- [x] Fix: Updated Google Cloud Console redirect URI to /api/gmail/callback
- [x] Fix: Updated getAuthUrl procedure to use the server-side callback URI
- [x] Fix: SmartInvoices.tsx updated to handle gmail_connected=1 and gmail_error params

## Phase 10: Gmail Email Parsing Overhaul

- [x] Fix: Force Gmail read permissions during OAuth (block if user denies mail.readonly scope)
- [x] Fix: Strip HTML tags from email body before displaying — show clean text only
- [x] Feature: Parse PDF attachments from emails and extract invoice data
- [x] Feature: Use AI to extract structured data (provider, amount, date, due date) from clean email text
- [x] Feature: Use AI to extract structured data from PDF attachment content
- [x] Fix: Display proper invoice details (amount, date, provider) instead of raw HTML/text
- [ ] Feature: Create dedicated email parsing skill for Gmail invoice extraction

## Phase 11: PDF Reading Fix & Gmail Scanning Skill

- [x] Bug: EVAYA invoice PDF not read — investigate and fix PDF attachment detection
- [x] Feature: Add "clear all and rescan" button to refresh old invoices with new parser
- [x] Feature: Create dedicated Gmail invoice scanning skill for LLM usage
- [x] Ensure all PDF attachments are downloaded, analyzed, and data displayed properly

## Phase 12: Security Hardening

- [x] Implement Israel-only geo-blocking middleware (block all non-IL IPs)
- [x] Add SQL injection protection (parameterized queries audit, input validation)
- [x] Add XSS protection (Content-Security-Policy headers, input sanitization, output encoding)
- [x] Enforce private access — only authorized/whitelisted users can access the system
- [x] Add security headers (HSTS, X-Frame-Options, X-Content-Type-Options, etc.)
- [x] Add rate limiting to prevent brute force attacks
- [x] Write security tests
- [x] Create security audit report documenting where data is stored and processed

## Phase 13: Critical Security Fixes
- [x] Fix: Add userId check to getAnalysis procedure (prevent cross-user access)
- [x] Fix: Add userId check to getChatHistory procedure (prevent cross-user access)
- [x] Fix: Switch S3 to presigned URLs only — no public file access ever
- [x] Fix: Encrypt all sensitive DB fields (extractedText, analysisResult, chatMessages.content, smartInvoices.rawText, smartInvoices.extractedData)
- [x] Feature: Add audit logging table and log all sensitive operations
- [x] Fix: Use separate encryption key (ENCRYPTION_KEY env var, not derived from JWT_SECRET)
- [x] Fix: Add CORS whitelist for production domain only (+ manus.computer/manus.space)
- [x] Fix: Add file size limits on upload endpoints (50MB max)
- [x] Fix: Add presigned URL endpoint for secure file access (getSecureFileUrl)

## Bug Fix: Published Site 403 Infinite Loop
- [x] Fix: Replaced geoip-lite with geoip-country for proper IPv6 support (Israeli IPv6 was returning null)
- [x] Fix: Use cf-connecting-ip header (Cloudflare) for real client IP detection behind CDN
- [x] Fix: Use x-original-host header to detect Manus dev preview (host header shows internal Cloud Run URL)
- [x] Fix: Added trust proxy to Express for correct IP parsing behind CDN
- [x] Fix: Geo-blocking still enforced on manus.space — only manus.computer (dev preview) is exempt
- [x] Tests: 95 tests passing including new IPv6, cf-connecting-ip, and x-original-host tests
