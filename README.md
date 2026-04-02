# BJJ Academy Manager - Jiu Jitsu School Management App

A complete mobile app for managing Brazilian Jiu Jitsu academies, designed to improve operational performance and track student progress.

## Overview

**BJJ Academy Manager** is a complete mobile app with a **role-based architecture** supporting three user types:
- **Students** - Book classes, track belt progress, view schedule
- **Coaches** - Manage assigned classes, add training results
- **Managers** - Full platform control with dashboard, finances, and brand management

## Role-Based Access Control

### Student Access
**Tabs:** Home, Book, Classes, Progress, Chat, Profile

**Permissions:**
- Book and manage their own classes
- Confirm attendance after class ends (Home Next Class card + Lessons tab)
- Track BJJ skills and belt progress
- Interact with Academy News Feed (post, like, comment)
- Chat with AI BJJ Coach and academy staff

**Restrictions:**
- Cannot delete other users' posts
- Cannot assign coaches
- Cannot edit academy brand
- Cannot see financial data
- Cannot generate invite codes

### Coach Access
**Tabs:** Home, Classes, Chat, Profile

**Permissions:**
- View assigned classes
- Confirm class completion
- Add training results and ratings
- Comment and like posts in Academy News Feed
- Respond to student chats

**Restrictions:**
- Cannot delete other users' posts
- Cannot access finances
- Cannot generate invite codes
- Cannot edit academy brand

### Manager Access
**Tabs:** Home, Manager Panel, Chat, Profile

**Full Permissions:**
- Create and manage invite codes
- View and manage all bookings
- Assign coaches to confirmed classes
- View financial dashboard with charts
- Edit academy brand (logo, colors)
- Manage coaches (add/remove)
- Delete any post, comment, or user-generated content
- Post announcements in Academy News Feed
- Award belt promotions

## Home Screen Structure

The home screen follows a premium dark UI design:

### Design System
- **Background:** Dark navy gradient (#0A1628 → #0F1F35)
- **Cards:** Glass surfaces with subtle white borders (rgba transparency)
- **Accent:** Navy/Gold color scheme for BJJ aesthetics
- **Typography:** High-contrast white text with secondary opacity variants

### 1. Training Overview (Hero Section)
Premium glass card with training stats:
- **Primary metrics:** Classes this month, mat time, sparring sessions
- **Next class info:** Upcoming class details
- **Belt colors:** Visual indicators for belt ranks

### 2. Quick Actions Grid
Navigation shortcuts in 2x2 grid:
- Book, Classes, Progress, Chat
- Glass card styling with gold accent icons
- Touch feedback with scale animation

### 3. Mural (Academy Feed Preview)
Live feed preview of the most recent 3 academy posts:
- Reads from Firestore `posts/` top-level collection, filtered by `schoolId`
- Inline like toggle (writes to `posts/{id}/likes/{uid}`)
- Comment count tap opens MuralFullModal
- "See all" opens full MuralFullModal
- Only shown when user has a valid `schoolId`

**MuralFullModal** (`src/components/MuralFullModal.tsx`):
- Full scrollable feed ordered by `createdAt desc`
- Like toggle with optimistic update
- Comment bottom-sheet per post (reads/writes `posts/{id}/comments/`)
- Create post sheet — visible to **manager** and **coach** only
- `serverTimestamp()` used for all timestamps
- Graceful `permission-denied` handling with Alert

**MuralHomeSection** (`src/components/MuralHomeSection.tsx`):
- Preview card rendering the 3 latest posts
- Firestore `limit(3)` query with `where("schoolId", "==", schoolId)`
- Optimistic like toggle in preview

### 4. BJJ Coach Card
AI coaching assistant access:
- Quick topic chips for common BJJ questions (Guard, Submissions, Escapes, Takedowns, Competition, Drilling)
- "Open BJJ Coach" CTA button
- Glass surface styling matching design system

## Manager Panel Features

### 4. Competitions (Home card → full screen)
Top-level Firestore collection: `competitions/{competitionId}`

**Service:** `src/lib/services/competitions.ts`
- `subscribeToCompetitions(schoolId, role, onData, onError)` — live listener; students get `isPublished==true` only; coach/manager get all
- `createCompetition(schoolId, uid, form)` — sets `schoolId`, `createdBy`, `updatedAt=serverTimestamp()`, `date=Timestamp`; omits optional strings/endDate when blank
- `updateCompetition(id, form)` — never touches `schoolId`/`createdBy`; clears optional fields with `deleteField()`; `endDate` cleared with `deleteField()` when removed
- `deleteCompetition(id)` — manager only (enforced in UI + Firestore rules)

**Screen:** `src/components/CompetitionsScreen.tsx`
- Waits for `schoolId` before querying
- Students: read-only (published only)
- Coach: create + edit
- Manager: create + edit + delete (confirm dialog)
- `permission-denied` → Alert "You don't have access to competitions."

**Home card:** `src/components/CompetitionsHomeCard.tsx`
- Preview of 3 upcoming competitions
- "See all" pushes `/(tabs)/competitions`

**Route:** `src/app/(tabs)/competitions.tsx` — registered with `href: null` (hidden from tab bar)


- Stats cards: Monthly Revenue, Total Bookings, Active Coaches, Students
- Quick actions and recent activity preview

### 2. Invite Code Manager
- Generate new invite codes (exactly 6 digits)
- Set role type (student/coach)
- Set maximum usage count
- Set expiration date
- View active invites table
- Deactivate/reactivate codes

### 3. Financial Dashboard
- Monthly revenue card with trend indicator
- Revenue breakdown by class type (Gi, No-Gi, Private)
- Bar chart showing monthly revenue trends
- Pie chart for class type distribution
- Export functionality with audit logging

### 4. Booking Manager
- List all bookings with search and filter
- Filter by status: Pending, Confirmed, Completed, Cancelled
- **Assign Coach & Confirm** - For pending bookings
- Cancel booking action
- Internal notes

### 5. Team Member Manager
- List team members (coaches/students) with status and role badges
- Add team member manually
- Remove team member with confirmation
- Toggle active/inactive status

### 6. Brand Editor (Theme Selection)
- **6 Premium Theme Presets**:
  - Black Belt (#1A1A1A)
  - Navy Blue (#1E3A5F) - default
  - Crimson (#DC2626)
  - Gold (#B8860B)
  - Purple Belt (#7C3AED)
  - Brown Belt (#8B4513)
- Logo URL with preview
- Academy Description
- Live preview of selected theme

## Class Types

- **Gi Class** - Traditional Brazilian Jiu Jitsu with kimono
- **No-Gi Class** - Submission grappling without kimono
- **Private Class** - 1-on-1 instruction
- **Open Mat** - Free training time
- **Seminar** - Special technique workshops

## Skill Levels

- **Fundamentals** - White to blue belt basics
- **Intermediate** - Blue to purple belt techniques
- **Advanced** - Purple belt and above
- **All Levels** - Open to all belt ranks

## Belt Ranks

The app tracks standard BJJ belt progression:
- White Belt (with stripes 0-4)
- Blue Belt (with stripes 0-4)
- Purple Belt (with stripes 0-4)
- Brown Belt (with stripes 0-4)
- Black Belt

## Training Results Tracking

Coaches can rate students on:
- **Technique** - Execution of moves
- **Drilling** - Practice quality
- **Sparring** - Live rolling performance
- **Attitude** - Mindset and coachability
- **Cardio** - Conditioning (optional)

Plus tracking of:
- Techniques learned
- Next class focus areas
- Media attachments (photos/videos)

## Tech Stack

- **Framework**: Expo SDK 53 + React Native 0.76.7
- **Routing**: Expo Router (file-based routing)
- **Styling**: NativeWind (TailwindCSS for React Native)
- **State Management**: Zustand with persistence
- **Animations**: react-native-reanimated v3
- **Icons**: lucide-react-native
- **AI**: OpenAI API for AI BJJ Coach
- **Auth**: Firebase Auth + Firestore
- **i18n**: Custom translation system with Zustand persistence

## Internationalization (i18n)

The app supports full UI language switching with three languages:
- **English (en)** - Default
- **Spanish (es)** - Español
- **Portuguese (pt-BR)** - Português (Brasil)

Language is persisted to AsyncStorage and loaded on startup. All screens subscribe to locale changes via `useLanguageStore((s) => s.locale)` ensuring a global re-render when the user switches language. Missing translation keys fall back to English automatically.

### Translated Screens
All major screens use `useTranslations()` for UI strings:
- Home, Lessons, Chat/Help, Progress, Profile, Admin, Tab labels

### Usage

```typescript
import { useTranslations } from "@/lib/i18n";
import { useLanguageStore } from "@/lib/i18n/language-store";

function MyComponent() {
  const t = useTranslations();
  useLanguageStore((s) => s.locale); // force rerender on locale change
  return <Text>{t.booking.title}</Text>;
}
```

### Translation Keys
Organized by domain: `nav`, `common`, `home`, `lessons`, `chat`, `progressScreen`, `profileScreen`, `aiCoach`, `booking`, `auth`, `welcome`, `join`, `competitions`, `mural`, `errors`

## Firebase Collections

The app uses these Firebase collections:
- `users` - User profiles with role field, photoURL, photoUpdatedAt
- `schools` - Academy/tenant data with brand settings
- `school_invites` - Invite codes
- `bookings` - Class bookings
- `school_posts` - Academy News Feed posts
- `student_notes` - Coach notes visible to students (student progress view)
- `progress_entries` - Progress entries managed by coaches/managers

## Services & Pricing

### Drop-in Class: $35
### Private Class: $100
### Packages:
- 8 classes: $200
- 12 classes: $270
- Monthly Unlimited: $150

## Notes

- Role access is read from `users/{uid}.role`
- Firebase collections support multi-tenant architecture
- Payment is collected at the academy (no in-app payments)
- Safety is emphasized with proper waiver and injury tracking
- Belt promotions are tracked with audit logging
- Student Progress screen (student view) reads from `student_notes` collection with coach name resolution and caching; coaches/managers still use `progress_entries`
- Splash overlay: fullscreen black overlay with Tatame "A" logo shown for 1.3s on app launch with glow pulse animation, then fades out (SplashOverlay component in root layout)
- Landing page (welcome.tsx): Uses AYON metallic logo image (ayon-logo.png) centered at max width 220px with 300ms fade-in animation, replacing the previous "TATAME" text
- Profile page footer: AYON metallic logo (70px, 0.85 opacity, subtle shadow) with "Powered by" caption centered below it, replacing the previous "Powered by Tatame" text
- Home Training Overview stats wait for user doc + schoolId before querying `lesson_assignments`; on permission error, stats show zeros (no crash)
- Profile photo upload uses URI-based blob upload via XMLHttpRequest (native) and fetch (web) instead of base64 to avoid iOS "ArrayBuffer" blob errors
- Storage path: `profilePhotos/{uid}/avatar.jpg`

## Manual Payments MVP

Students can submit payment proofs to their manager for approval.

### Student Flow
- **Profile > Payments** opens the `student-payments` screen
- Loads `schools/{schoolId}/payment_settings/default` to check if payments are enabled
- If enabled, shows 3 payment options: Monthly Membership, Drop-in Class, Private Lesson (each with price from settings)
- Student taps "Submit" to open modal with optional proof note and receipt URL
- Creates invoice in `schools/{schoolId}/invoices/{autoId}` with `status: "submitted"`
- "My Payments" list shows all student invoices with status badges (submitted / approved / rejected)
- Student can "Edit proof" on submitted (pending) invoices only

### Manager Flow
- **Admin > Payment Requests** opens the `payment-requests` screen
- Segmented filter: Submitted / Approved / Rejected
- Each card shows student name, amount, description, proof note, proof URL (tappable)
- Actions: Approve / Reject (with confirmation dialogs)
- Approve sets `status: "approved"`, `approvedAt`, `approvedBy`
- Reject sets `status: "rejected"`, `rejectedAt`, `rejectedBy`

### Firestore Structure
- `schools/{schoolId}/payment_settings/default` — `isPaymentEnabled`, `currency`, `membershipMonthlyPrice`, `dropInPrice`, `privatePrice`
- `schools/{schoolId}/invoices/{invoiceId}` — `studentUid`, `studentName`, `type`, `amount`, `currency`, `description`, `status`, `proofNote`, `proofUrl`, `createdAt`, `updatedAt`, `createdBy`, `approvedAt`, `approvedBy`, `rejectedAt`, `rejectedBy`
