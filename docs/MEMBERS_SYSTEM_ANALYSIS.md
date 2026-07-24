# GlobeExpenses — Travel Members & Invites System Analysis

## Current Implementation Overview

### Data Model
- **TravelMember**: `{ travelMemberId, displayName, userId, allowRename, joinedAt }`
  - `travelMemberId`: nanoid (stable key for Split[])
  - `userId`: Firebase Auth UID or null (unclaimed slot)
  - `allowRename`: boolean flag (can others rename this person)

- **Travel fields**:
  - `members: TravelMember[]` — full member objects
  - `memberUids: string[]` — flat array of UIDs (access control only, never modified by claim/unclaim)
  - `createdBy: string` — creator's UID (reassigned on leave)

- **Invite**:
  - `type: 'friend' | 'travel_member'`
  - `toUid?: string` — targeted invite (single-use)
  - `multiUse: boolean` — shareable link
  - `status: 'active' | 'accepted' | 'declined' | 'revoked'`
  - `usedBy: string[]` — prevents double-accept on single-use invites

### Key Flows

#### 1. Travel Invite Acceptance (`acceptTravelInvite`)
1. Non-member has invite link
2. Calls `acceptTravelInvite(invite, userProfile)`
3. **Atomic batch**:
   - Update invite: `usedBy += uid`, status→'accepted' (if single-use)
   - Add new TravelMember to members[] via arrayUnion
   - Add uid to memberUids via arrayUnion
   - Set pendingInviteId for security rule validation
4. **After batch**: InvitePage reads travel, fetches unclaimed slots
5. **Identity pick screen**: if unclaimed slots exist, show "Who are you?"
6. **Friendship writes**: fire-and-forget (outside batch, idempotent)

#### 2. Claim/Unclaim Flow
- **Claim**: `claimTravelMember(travelId, travelMemberId, userId, members)`
  - Transfer semantics: nulls user's previous slot, claims target slot
  - `memberUids` NOT modified (access already granted)

- **Unclaim**: `unclaimTravelMember(travelId, travelMemberId, members)`
  - Sets `userId → null` on a slot
  - `memberUids` NOT modified

#### 3. Leave Travel
- `leaveTravel()`: user's uid removed from memberUids (revokes access)
- User's member slot unclaimed (`userId → null`) but NOT deleted
- Creator reassigned if leaving user was createdBy

#### 4. Friend Invites
- **Send**: `sendFriendRequest(fromUser, toUid)` — single-use targeted invite
- **Accept**: `acceptFriendRequest(invite, currentUser)` — batch write friendship on both sides
- Can also accept via multi-use shareable link with `createShareableInvite()`

---

## Issues & Observations from Your Remarks

### Critical Issues

#### Issue 1: Invitation Testing — Acceptance from Friend
> accepting travel invitation from someone who is already a friend. Accept -> Nothing happens

**Current behavior**:
- `acceptTravelInvite()` always creates a new TravelMember slot + joins memberUids
- Friendship writes are fire-and-forget, so they can't interfere
- **Problem**: If user was already a friend, friendship write is idempotent but the user gets **another member slot**

**Expected behavior**:
- When accepting a travel invite from someone who is already a friend, deduplicate (check if user already has a slot in this travel)
- If already in travel, show "Already a member" UI instead of creating a new slot

#### Issue 2: "Ghost Members" Matching
> accept "ghost" members -> very important for the UI.
> + match between new arrival and "unclaimed" member
> + transactionform when solo: Label "Was this transaction with other persons ? Add them to your travel."

**Current state**:
- Identity pick screen ✓ (only shows after join, when unclaimed slots exist)
- BUT: if user is invited via shareable link that was sent to multiple people, and both accept, they each get a new slot (not matched to same unclaimed placeholder)
- **Missing**: pre-invite unclaimed slot detection
  - When sending a targeted invite to a friend, check if travel already has unclaimed slot with matching name/heuristics
  - When accepting, show "Is this you?" before creating new slot if similar names exist

#### Issue 3: Confusion Between Friend vs Travel Invites
> travel invite -> received a friend invite instead ?
> friend invite: if you receive a "travel invite" from someone who is already a friend, display it "transparent/greyed" in TravelDetail, with button accept/deny.

**Current state**:
- ProfilePage shows two sections: "Travel invitations" + "Friend requests"
- BUT: No special handling if receiving a travel invite from someone already friends

**Problem**:
- If User A and B are friends, User A invites B to a travel via shareable link → B sees it in "Travel invitations"
- BUT: If User A sends a **targeted travel invite** after becoming friends, unclear what happens (probably accepted silently)
- No visual distinction between "you're being invited to join a new travel" vs "your friend wants you in their travel"

#### Issue 4: Claim Logic & Permissions
> revoir l'impact reel de claim. Uniquement nom par default pour le paidBy ? Ou autre chose ? L'indiquer dans l'UI.

**Current behavior**:
- `claimTravelMember`: links userId to slot
- Transfer semantics: if user already owns another slot, that's nulled
- **Questions**:
  - What actually changes when you claim? Just displayName fallback to your account displayName?
  - Does paidBy default to the newly claimed slot?
  - Should UI clearly state "Claiming means all future transactions default to this person"?

#### Issue 5: Rename Locked by Creator
> rename: member was not renamed
> rename: rename the creator, creator can still rename even if rename is locked

**Current logic** (in ParametersTab):
```typescript
function canRename(member: TravelMember): boolean {
  if (member.userId === null) return true  // unclaimed: anyone can
  if (member.userId === currentUser?.uid) return true  // linked user always
  if (isCreator && member.allowRename) return true  // creator can if flag permits
  return false
}
```

**Problem**: Creator can ALWAYS rename themselves (even if they set `allowRename: false`)
- When creator locks their own rename, they can still edit it
- Should creator's own lock be honored?

---

### Design/Flow Issues

#### Issue 6: "No Slot" State
> new elements: Add unclaimed member + invite flow skips the identity pick screen
> When an unclaimed member is added manually (name-only), and then that person is invited and accepts, the one-time "who are you in this trip?" screen is not shown — even though there is an unclaimed slot that matches them.

**Current flow**:
1. Travel creator adds "Marc" as unclaimed member
2. Creator invites Marc → Marc accepts invite
3. Marc gets a **new slot** (because acceptTravelInvite always adds arrayUnion)
4. Identity pick screen shows, but **already has 2 Marc entries** (old + new)
5. User can claim either one, but unclear which is which

**Better flow**:
- Before showing identity pick, detect if new member has same displayName as an existing unclaimed slot
- **Question**: Should acceptTravelInvite check for existing slots before creating a new one?

#### Issue 7: Unclaim = Kick (confusing semantics)
> problems with previous member travels version:
> - unclaim someone -> kick out of the travel

**Current state (Fixed in Session 012)**:
- Unclaim sets `userId → null`, does NOT modify memberUids
- So unclaimTravelMember is NOT a kick — access retained
- **But**: UI label "Unlink" is ambiguous
  - For user's own: "Unlink my account" ✓ (clear)
  - For creator unclinking others: "Unlink" ✗ (could mean kick)

#### Issue 8: Multiple Claims for Same User
> claim : can claim multiple user at the same time
> Ex: Jean unclaims Marc. Marc is kick-out. The 'marc' in the travel is now unclaimed. Jean invites marc again. Marc accepts the invitation. There are now two 'marc's' in the travel (one claimed and one unclaimed). Marc (user) claims the 'marc' name. -> Marc is now claiming the 2 marc.
> The all model is broken.

**Current state**:
- `claimTravelMember` uses transfer semantics: one user = one slot max
- If user claims a slot while owning another, the old one is nulled
- **But**: UI allows claiming multiple unclaimed slots (no prevention in identity pick)
- **Real issue**: user can see 2 "Marc" entries in identity pick and claim both sequentially

**Should be fixed by**: transfer semantics in `claimTravelMember`, but identity pick UI should prevent double-claim (disable already-claimed slots for this user)

#### Issue 9: Re-Invite Flow (Jean/Marc Scenario)
> Jean unclaims Marc. Marc is kick-out.

**Semantics question**:
- When Jean unclaims Marc, is Marc kicked out (removed from memberUids) or just unlinked?
- Current: unclaimTravelMember does NOT modify memberUids → Marc retains access ✓
- But UI language "Unlink" doesn't clearly communicate this

---

### UX/Display Issues

#### Issue 10: Solo Travel Member Display
> voyage solo: pas de notion de "rename" et unclaimed". Just un label (comme dans balance)

**Current**:
- ParametersTab shows full members list, claim/unclaim buttons even for solo travel
- Should be simplified: just show "You" label, no claim/unclaim actions

#### Issue 11: Friend Invite Appearance
> if already friends > pas de raison d'etre

**Current**:
- InvitePage shows "Already friends" for friend invites that are already used
- But no special UI for targeted travel invites from someone already a friend

#### Issue 12: Member List Reordering
> in parameterstab, list of member should render dynamically (hooks)

**Current**:
- `travel.members` order is static (determined by join order)
- No UI for reordering members
- Could be useful: sort alphabetically, or by join date

---

## Miscellaneous / v2 Items

### Should be addressed in v1:
1. **Double-claim prevention** in identity pick screen
2. **Duplicate slot detection** on invite acceptance (check existing unclaimed slots with similar names)
3. **UI clarity** on what claiming does (impact on transaction defaults, displayName handling)
4. **Creator self-rename lock** — should lock apply to creator?
5. **Solo travel UX** — hide claim/unclaim/rename actions when solo
6. **"Already a member" detection** — don't create new slot if user already in travel

### Can defer to v2:
- Per-travel "join-date visibility cutoff" for old transactions
- Dynamic member list reordering
- Pre-match unclaimed slots on invite (heuristic matching by name)
- Wallet visibility improvements (currently anyone can see others' wallet events in Firestore, only UI hides them)
- Concurrent edit conflict detection

---

## Next Steps for Design Session

You should review and clarify:
1. **Claim semantics**: What should happen to paidBy defaults, displayName, etc. when a user claims a slot?
2. **Unclaim behavior**: Should unclaimTravelMember be renamed to something clearer? (e.g., "unlink")
3. **Double-slot prevention**: How aggressive should the fix be? Pre-check on invite, or just UI-level in identity pick?
4. **Solo travel**: Should claim/unclaim/rename be hidden entirely for solo travels?
5. **Creator lock self-rename**: Should creator be able to override their own lock?
6. **Existing member check**: If user already has a slot, should re-inviting them create a new slot or navigate to travel?
