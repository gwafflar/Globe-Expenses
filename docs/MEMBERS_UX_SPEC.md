# GlobeExpenses — Members, Invites & Claims UX Specification

**Version**: 1.0 (Session 019)
**Status**: Ready for implementation

---

## Core Principles

1. **No orphaned users** — A user must always be linked to exactly one member slot
2. **No duplication** — One user = one slot (transfer semantics enforced)
3. **No "?" members** — Transactions always have a real person in paidBy/beneficiaries
4. **Clear language** — "This is me" / "This is not me" instead of claim/unclaim
5. **Solo travel simplified** — No member management UI until adding someone

---

## Claim / Unclaim / Rename Flow

### Claiming a Member

**When shown:**
- User has joined travel but not claimed any slot
- Or user clicks "This is not me" (see unlink below)

**Interaction:**
- Button label: "🎯 This is me"
- Only shown on unclaimed member slots
- Click → immediately claims (with optimistic update)
- Effect: `userId` set to current user's UID

**What changes when you claim:**
- ✅ You become "you" in transaction defaults (paidBy)
- ✅ Transactions appear as "for me" in transaction list
- ✅ Dashboard stats include your transactions under this member
- ✅ Balance shows your share (debts/credits)
- ❌ displayName does NOT change (remains what it was)

---

### Unlinking a Member

**Current state:** User has a claimed member slot.

**Interaction:**
- Button label: "❌ This is not me"
- Click → opens modal/drawer

**Modal shows:**
1. List of unclaimed member slots in this travel
2. Option: "Create new member" (inline text field + button)

**User chooses:**
- Click "This is me" on an unclaimed member → claim it (old slot auto-unlinks via transfer semantics)
- OR enter a name + click "Create new member" → new unclaimed slot created, user claims it (old slot auto-unlinks)
- OR cancel → nothing changes

**Behavior:**
- User cannot have zero claimed slots (must choose before modal closes)
- No explicit "old slot unlinks" message needed (transfer semantics handles it silently)
- Old unclaimed slot remains for others to claim later

**UX note:** The "This is not me" button should only be visible to the user themselves (not shown to creator or other members).

---

### Renaming a Member

**Default state:** Anyone can rename anyone.

**Lock mechanism:**
- Only the member themselves can toggle the lock on their slot
- Lock label: "🔓 You can rename me" / "🔒 Lock my name"
- Locked status: other users cannot rename you

**Display when renamed:**
- Format: `🧑 Marc (Marcus)`
- Where "Marc" = current `member.displayName`
- Where "Marcus" = the user's account displayName (from Firebase Auth)
- Shown to all members for clarity

**Permission check:**
```typescript
function canRename(member: TravelMember): boolean {
  // Unclaimed: anyone can rename
  if (member.userId === null) return true
  // Linked user: always can rename themselves
  if (member.userId === currentUser?.uid) return true
  // If member locked it, no one else can rename
  if (!member.allowRename) return false
  // Otherwise, anyone can rename
  return true
}
```

**Rename button:**
- Shown when `canRename(member) === true`
- Pencil icon (✏️) or "Edit name" button
- Click → inline input field
- Save on Enter or blur

---

## Solo Travel Simplified UX

**When:** `travel.members.filter(m => m.userId).length === 1` (only current user claimed)

**Members section shows:**
```
Members: You
(no rename button, no "This is not me" button)

ℹ️ Did you know? You can add other people in this travel,
   and share your transactions with them.

[+ Add member]  (button remains visible)
```

**Effect:**
- User sees a reminder they can invite others
- No member management clutter
- Can still add members via button

---

## Adding Members (Unified UI)

**Button label:** `+ Add member` (or similar)

**Opens modal/drawer with 4 options (tabs or sections):**

### Tab 1: Add by Name
```
Enter a person's name:
[__________]
[Add person without account]
```
Creates unclaimed member slot. Anyone in travel can rename later.

### Tab 2: Invite a Friend
```
Your friends:
☐ Alice (already in travel)
☑ Bob
☐ Charlie
☐ Diana

[Invite selected]
```
Sends travel invite to selected friends. They must accept to join. Becomes friends if not already.

### Tab 3: Invite by Username (NEW)
```
Search users by @username:
[@alice_travels]
[Search]

Results:
Alice (@alice_travels)
[Send invite]
```
Search by username → sends travel invite. They accept to join + become friends.

### Tab 4: Generate Link
```
[Generate shareable invite link]

(if generated)
https://globe-expenses.web.app/invite/abc123def456
[Copy] ✓

Anyone with this link can join and become your friend.
```
Multi-use shareable link.

---

## Transaction Form Behavior

**Requirement:** User must have a claimed member slot before creating a transaction.

**Current issue:** TransactionForm defaults paidBy to "You" even if user has no claimed slot → "?" appears.

**Fix options:**
1. **Prevent form open** — Show toast/alert before opening TransactionForm if user has no slot
2. **Disable save** — Allow form to open, but disable "Save" button if user has no claimed slot
3. **Force claim first** — Redirect to ParametersTab with unclaim flow modal if no slot

**Recommendation:** Option 1 (prevent form open) + helpful message:
```
"You haven't claimed a member yet. Choose who you are in this
travel first, then you can record transactions.

[Go to Members]"
```

Or in solo travel: since invite flow exists, could say:
```
"Add yourself as a member first. Go to the Members section,
or invite others to share this travel."
```

---

## Member Reconciliation (Merge Tool)

**When needed:** User notices two member slots for the same person (duplicate).

**Access:** ParametersTab Members section → "..." menu or "Manage members" → Reconciliation tool

**Flow:**

1. **Select two members to merge**
   ```
   Two members, one person?

   ☐ Marcus (account: Marcus)
   ☐ Marc (unclaimed)

   [Select both to merge]
   ```

2. **Confirm which to keep**
   ```
   Merge members?

   "Marc" will be DELETED.
   "Marcus" will be KEPT.

   This will update:
   • 5 transactions (paidBy/beneficiaries)
   • 2 as creator
   • Lastly, Uris will also be updated

   ⚠️ This cannot be undone.

   [Cancel] [Merge]
   ```

3. **Atomic update in Firestore**
   - Delete member with ID = `travelMemberId_to_delete`
   - Update all transactions:
     - Replace `travelMemberId_to_delete` with `travelMemberId_to_keep` in `paidBy` splits
     - Replace in `beneficiaries` splits
     - If `createdBy.uid === travelMemberId_to_delete`, update to `travelMemberId_to_keep`
     - If `lastModifiedBy` references deleted member, update it
   - Single batch write (atomic)

4. **Result**
   ```
   ✅ Members merged successfully.

   "Marc" deleted. All transactions updated.
   You can now see your expenses under "Marcus".
   ```

---

## Identity Pick Screen (Post-Invite)

**When:** User accepts travel invite, and unclaimed slots exist in travel.

**Shown:**
```
👥 Who are you in this trip?

Some members were added before you joined.
If one of them is you, select it — your account will
be linked to that member's expenses.

[🧑] Alice
     [This is me]  [Skip]

[🧑] Bob
     [This is me]  [Skip]

[+ Create new member] "I'm someone new"
```

**User chooses:**
- "This is me" → claim slot (auto-unlinks any previous slot if needed)
- "Create new member" → type name, new unclaimed slot created + auto-claim
- "Skip" → leaves all slots unclaimed (but then cannot create transactions until claiming)

---

## Security Rules Impact

Current rule for travel access check:
```
auth.uid in resource.data.memberUids
```

This remains unchanged. **memberUids is access control only.**

**For transactions:** Require that `paidBy` and `beneficiaries` contain at least one split with a `travelMemberId` that exists in `travel.members` (client-side validation only for v1; server-side could be added in v2).

---

## Testing Checklist

- [ ] User can claim an unclaimed member
- [ ] User cannot have zero claimed slots (unlink forces choice)
- [ ] Transfer semantics: claiming new slot unclaims old one
- [ ] User cannot create transaction without claimed slot
- [ ] Rename: locked member prevents others from renaming
- [ ] Rename: display shows original displayName
- [ ] Solo travel: hide member management, show educational message
- [ ] Add member: all 4 tabs work (name, friend, username, link)
- [ ] Invite by username: sends travel invite (not auto-friend)
- [ ] Member reconciliation: batch updates all affected transactions
- [ ] Identity pick: shows only unclaimed members; allows creating new
- [ ] Creator cannot override member's rename lock
- [ ] Solo travel: "Add member" button still visible and functional

---

## Files to Modify

**Core changes:**
- `src/travels/components/tabs/ParametersTab.tsx` — MembersSection (major refactor)
- `src/friends/pages/InvitePage.tsx` — identity pick logic
- `src/transactions/components/TransactionForm.tsx` — require claimed member check
- `src/travels/services/travelService.ts` — add reconciliation function
- `src/travels/components/tabs/ParametersTab.tsx` — add reconciliation UI

**New files (maybe):**
- `src/travels/components/ReconcileMembers.tsx` — modal/drawer for merge flow (optional, could be inline)

---

## Future (v2+)

- Reconciliation preview (show affected transactions before confirming)
- Friend list management (add/remove)
- Per-travel displayName override from UserProfile (so you can use different name in each travel)
- Automatic duplicate detection + suggestion UI
