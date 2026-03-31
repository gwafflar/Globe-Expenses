// src/travels/components/tabs/ParametersTab.tsx

import { useEffect, useRef, useState } from 'react'
import { nanoid } from 'nanoid'
import type { LabeledItem, Travel, TravelMember } from '@/travels/types'
import { getTravelMainCurrency } from '@/travels/types'
import {
  updateTravelCurrencies,
  updateTravelList,
  updateTravelMeta,
  updateTravelDefaultRate,
  addUnclaimedMember,
  renameTravelMember,
  claimTravelMember,
  unclaimTravelMember,
  setMemberAllowRename,
  archiveTravel,
  unarchiveTravel,
  leaveTravel,
  deleteTravel,
} from '@/travels/services/travelService'
import type { TransactionWithStatus } from '@/transactions/hooks/useTransactions'
import { useAuthStore } from '@/auth/store/useAuthStore'
import {
  fetchFriends,
  sendTravelInvite,
  createShareableInvite,
} from '@/friends/services/friendService'
import type { Friend } from '@/friends/types'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { ALL_CURRENCIES, ALL_COUNTRIES } from '@/shared/data/pickerData'
import { getExchangeRate } from '@/shared/utils/exchangeRates'
import { Share2, UserPlus, Check } from 'lucide-react'
import { FeedbackForm } from '@/feedback/components/FeedbackForm'

// ---------------------------------------------------------------------------
// Section wrapper
// ---------------------------------------------------------------------------

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{title}</h3>
      {children}
    </section>
  )
}

// ---------------------------------------------------------------------------
// CollapsiblePicker wrapper — shows a summary button, expands on click
// ---------------------------------------------------------------------------

function CollapsiblePicker({
  summary,
  children,
}: {
  summary: React.ReactNode
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center justify-between rounded-lg border bg-card px-3 py-2.5 text-sm transition-colors hover:bg-accent/30"
      >
        <span>{summary}</span>
        <span className="text-muted-foreground text-xs">{open ? '▲' : '▼'}</span>
      </button>
      {open && children}
    </div>
  )
}

// ---------------------------------------------------------------------------
// CurrencyPicker — searchable checklist
// ---------------------------------------------------------------------------

function CurrencyPicker({
  selected,
  onChange,
  lockedCurrency,
}: {
  selected: string[]
  onChange: (codes: string[]) => void
  // The travel's mainCurrency — always checked, cannot be unchecked.
  lockedCurrency?: string
}) {
  const [search, setSearch] = useState('')

  const filtered = ALL_CURRENCIES.filter(([code, , name]) => {
    const q = search.toLowerCase()
    return code.toLowerCase().includes(q) || name.toLowerCase().includes(q)
  })

  function toggle(code: string) {
    // Prevent unchecking the locked (main) currency
    if (code === lockedCurrency && selected.includes(code)) return
    onChange(selected.includes(code) ? selected.filter((c) => c !== code) : [...selected, code])
  }

  const summary =
    selected.length === 0
      ? 'No currencies selected'
      : selected.join(', ')

  return (
    <CollapsiblePicker summary={<span><span className="font-medium">Currencies: </span>{summary}</span>}>
      <div className="flex flex-col gap-2 rounded-lg border p-2">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search currency…"
          className="w-full rounded-md border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        />
        <div className="flex max-h-56 flex-col gap-0.5 overflow-y-auto">
          {filtered.length === 0 && (
            <p className="px-3 py-2 text-xs text-muted-foreground">No currencies match.</p>
          )}
          {filtered.map(([code, symbol, name]) => {
            const checked = selected.includes(code)
            const isLocked = code === lockedCurrency
            return (
              <button
                key={code}
                type="button"
                onClick={() => toggle(code)}
                disabled={isLocked}
                className={`flex items-center gap-3 rounded px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent/40 ${checked ? 'bg-accent/20' : ''} ${isLocked ? 'opacity-60 cursor-not-allowed' : ''}`}
              >
                <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border text-[10px] ${checked ? 'border-primary bg-primary text-primary-foreground' : 'border-input'}`}>
                  {checked && '✓'}
                </span>
                <span className="min-w-0">
                  <span className="font-medium">{code}</span>
                  {isLocked && <span className="ml-1 text-xs text-muted-foreground">(main)</span>}
                  <span className="ml-1 text-muted-foreground">({symbol})</span>
                  <span className="ml-1 text-muted-foreground">— {name}</span>
                </span>
              </button>
            )
          })}
        </div>
      </div>
    </CollapsiblePicker>
  )
}

// ---------------------------------------------------------------------------
// ExchangeRateEditor — editable exchange rates for each currency in the travel.
//
// Shows all currencies in the travel's currencies list (except mainCurrency),
// each with an editable rate. The rate can be entered in either direction:
//   - "1 local = X main" (the stored format)
//   - "1 main = X local" (the inverse, for convenience)
// Changing one input auto-updates the other.
// ---------------------------------------------------------------------------

function ExchangeRateRow({
  code,
  mainCurrency,
  rate,
  travelId,
  onRateChange,
}: {
  code: string
  mainCurrency: string
  rate: number         // stored rate: 1 local = rate mainCurrency
  travelId: string
  onRateChange: (code: string, newRate: number) => void
}) {
  // "1 local = X main" (the stored format)
  const [localToMain, setLocalToMain] = useState(rate.toString())
  // "1 main = X local" (the inverse)
  const [mainToLocal, setMainToLocal] = useState(
    rate > 0 ? parseFloat((1 / rate).toPrecision(6)).toString() : ''
  )

  // Sync from props when travel.defaultRates changes externally
  useEffect(() => {
    setLocalToMain(rate.toString())
    setMainToLocal(rate > 0 ? parseFloat((1 / rate).toPrecision(6)).toString() : '')
  }, [rate])

  // User edits the "1 local = X main" field
  function handleLocalToMainChange(val: string) {
    setLocalToMain(val)
    const parsed = parseFloat(val)
    if (!isNaN(parsed) && parsed > 0) {
      setMainToLocal(parseFloat((1 / parsed).toPrecision(6)).toString())
    }
  }

  // User edits the "1 main = X local" field
  function handleMainToLocalChange(val: string) {
    setMainToLocal(val)
    const parsed = parseFloat(val)
    if (!isNaN(parsed) && parsed > 0) {
      setLocalToMain(parseFloat((1 / parsed).toPrecision(6)).toString())
    }
  }

  // Persist on blur from either field
  function handleBlur() {
    const parsed = parseFloat(localToMain)
    if (!isNaN(parsed) && parsed > 0 && parsed !== rate) {
      updateTravelDefaultRate(travelId, code, parsed).catch(console.error)
      onRateChange(code, parsed)
    }
  }

  // Look up symbol for display
  const match = ALL_CURRENCIES.find(([c]) => c === code)
  const symbol = match ? match[1] : ''

  return (
    <div className="flex flex-col gap-1.5 rounded-lg border bg-card px-3 py-2.5">
      <span className="text-sm font-medium">{code} {symbol && `(${symbol})`}</span>
      <div className="flex items-center gap-2 text-xs">
        {/* 1 local = X main */}
        <span className="shrink-0 text-muted-foreground">1 {code} =</span>
        <input
          type="number"
          inputMode="decimal"
          step="any"
          value={localToMain}
          onChange={(e) => handleLocalToMainChange(e.target.value)}
          onBlur={handleBlur}
          className="w-24 rounded border bg-background px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        />
        <span className="shrink-0 text-muted-foreground">{mainCurrency}</span>
      </div>
      <div className="flex items-center gap-2 text-xs">
        {/* 1 main = X local */}
        <span className="shrink-0 text-muted-foreground">1 {mainCurrency} =</span>
        <input
          type="number"
          inputMode="decimal"
          step="any"
          value={mainToLocal}
          onChange={(e) => handleMainToLocalChange(e.target.value)}
          onBlur={handleBlur}
          className="w-24 rounded border bg-background px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        />
        <span className="shrink-0 text-muted-foreground">{code}</span>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// CountryPicker — searchable checklist with flag emojis
// Replaces EditableLabeledList for countries
// ---------------------------------------------------------------------------

function CountryPicker({
  selected,   // country names currently in the travel's countries list
  travelId,
  onSelectedChange,
}: {
  selected: LabeledItem[]
  travelId: string
  onSelectedChange: (items: LabeledItem[]) => void
}) {
  const [search, setSearch] = useState('')

  const selectedNames = new Set(selected.map((i) => i.label.toLowerCase()))

  const filtered = ALL_COUNTRIES.filter(([, name]) => {
    return name.toLowerCase().includes(search.toLowerCase())
  })

  async function toggle(flag: string, name: string) {
    const lower = name.toLowerCase()
    let next: LabeledItem[]
    if (selectedNames.has(lower)) {
      next = selected.filter((i) => i.label.toLowerCase() !== lower)
    } else {
      next = [...selected, { id: nanoid(8), label: name, emoji: flag }]
    }
    onSelectedChange(next)
    await updateTravelList(travelId, 'countries', next)
  }

  const summary =
    selected.length === 0
      ? 'No countries selected'
      : selected.map((i) => `${i.emoji ?? '🌍'} ${i.label}`).join(', ')

  return (
    <CollapsiblePicker summary={<span><span className="font-medium">Countries: </span>{summary}</span>}>
      <div className="flex flex-col gap-2 rounded-lg border p-2">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search country…"
          className="w-full rounded-md border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        />
        <div className="flex max-h-56 flex-col gap-0.5 overflow-y-auto">
          {filtered.length === 0 && (
            <p className="px-3 py-2 text-xs text-muted-foreground">No countries match.</p>
          )}
          {filtered.map(([flag, name]) => {
            const checked = selectedNames.has(name.toLowerCase())
            return (
              <button
                key={name}
                type="button"
                onClick={() => toggle(flag, name)}
                className={`flex items-center gap-3 rounded px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent/40 ${checked ? 'bg-accent/20' : ''}`}
              >
                <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border text-[10px] ${checked ? 'border-primary bg-primary text-primary-foreground' : 'border-input'}`}>
                  {checked && '✓'}
                </span>
                <span className="text-base">{flag}</span>
                <span className="text-sm">{name}</span>
              </button>
            )
          })}
        </div>
      </div>
    </CollapsiblePicker>
  )
}

// ---------------------------------------------------------------------------
// EmojiInput
// ---------------------------------------------------------------------------

function EmojiInput({ value, onChange, onBlur, ariaLabel }: { value: string; onChange: (v: string) => void; onBlur?: () => void; ariaLabel: string }) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => {
        const raw = e.target.value
        if (typeof Intl !== 'undefined' && 'Segmenter' in Intl) {
          const seg = new (Intl as any).Segmenter()
          const segs = [...seg.segment(raw)].map((s: any) => s.segment)
          onChange(segs[0] ?? '')
        } else {
          onChange([...raw][0] ?? '')
        }
      }}
      onBlur={onBlur}
      placeholder="😀"
      inputMode="text"
      className="w-9 shrink-0 rounded-md border bg-background px-1 py-1 text-center text-base focus:outline-none focus:ring-2 focus:ring-ring"
      aria-label={ariaLabel}
    />
  )
}

// ---------------------------------------------------------------------------
// EditableLabeledList (used for categories, payment methods, cities)
// ---------------------------------------------------------------------------

type ListField = 'categories' | 'paymentMethods' | 'countries' | 'cities'

interface EditableLabeledListProps {
  items: LabeledItem[]
  travelId: string
  field: ListField
  placeholder: string
  onItemsChange: (items: LabeledItem[]) => void
}

function EditableLabeledList({ items, travelId, field, placeholder, onItemsChange }: EditableLabeledListProps) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editLabel, setEditLabel] = useState('')
  const [addLabel, setAddLabel] = useState('')
  const [addEmoji, setAddEmoji] = useState('')
  const [addRowKey, setAddRowKey] = useState(0)
  const editInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editingId && editInputRef.current) {
      editInputRef.current.focus()
      editInputRef.current.select()
    }
  }, [editingId])

  async function persist(next: LabeledItem[]) {
    onItemsChange(next)
    await updateTravelList(travelId, field, next)
  }

  function startEdit(item: LabeledItem) {
    setEditingId(item.id)
    setEditLabel(item.label)
  }

  async function commitEdit(id: string) {
    const trimmed = editLabel.trim()
    if (!trimmed) { setEditingId(null); return }
    await persist(items.map((item) => item.id === id ? { ...item, label: trimmed } : item))
    setEditingId(null)
  }

  async function updateEmoji(id: string, emoji: string) {
    await persist(items.map((item) => item.id === id ? { ...item, emoji: emoji || undefined } : item))
  }

  async function deleteItem(id: string) {
    await persist(items.filter((item) => item.id !== id))
  }

  async function addItem() {
    const label = addLabel.trim()
    if (!label) return
    await persist([...items, { id: nanoid(8), label, emoji: addEmoji || undefined }])
    setAddLabel('')
    setAddEmoji('')
    setAddRowKey((k) => k + 1)
  }

  return (
    <div className="flex flex-col gap-1.5">
      {items.map((item) => (
        <div key={item.id} className="flex items-center gap-2 rounded-lg border bg-card px-3 py-2">
          <EmojiInput value={item.emoji ?? ''} onChange={(v) => updateEmoji(item.id, v)} ariaLabel="Emoji" />
          {editingId === item.id ? (
            <input
              ref={editInputRef}
              type="text"
              value={editLabel}
              onChange={(e) => setEditLabel(e.target.value)}
              onBlur={() => commitEdit(item.id)}
              onKeyDown={(e) => { if (e.key === 'Enter') commitEdit(item.id); if (e.key === 'Escape') setEditingId(null) }}
              className="min-w-0 flex-1 rounded-md border bg-background px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          ) : (
            <button type="button" onClick={() => startEdit(item)} className="min-w-0 flex-1 truncate text-left text-sm hover:text-primary">
              {item.label}
            </button>
          )}
          <button type="button" onClick={() => deleteItem(item.id)} aria-label={`Delete ${item.label}`}
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-destructive">
            ✕
          </button>
        </div>
      ))}

      <div key={addRowKey} className="flex items-center gap-2 rounded-lg border border-dashed px-3 py-2">
        <EmojiInput value={addEmoji} onChange={setAddEmoji} ariaLabel="New item emoji" />
        <input
          type="text"
          value={addLabel}
          onChange={(e) => setAddLabel(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') addItem() }}
          placeholder={placeholder}
          className="min-w-0 flex-1 rounded-md border bg-background px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        />
        <Button type="button" size="sm" variant="outline" onClick={addItem} disabled={!addLabel.trim()} className="shrink-0">
          Add
        </Button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Avatar helpers
// ---------------------------------------------------------------------------

function avatarHue(seed: string): number {
  let hash = 0
  for (const ch of seed) hash = (hash * 31 + ch.charCodeAt(0)) & 0xffffffff
  return Math.abs(hash) % 360
}

// Claimed member: coloured avatar (using userId as seed so it matches the profile page).
// Unclaimed member: grey avatar.
function MemberAvatar({ member }: { member: TravelMember }) {
  if (member.userId) {
    const hue = avatarHue(member.userId)
    return (
      <div
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
        style={{ backgroundColor: `hsl(${hue}, 55%, 50%)` }}
      >
        {(member.displayName || '?').charAt(0).toUpperCase()}
      </div>
    )
  }
  // Unclaimed slot — grey avatar to visually distinguish from linked accounts
  return (
    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-bold text-muted-foreground">
      {(member.displayName || '?').charAt(0).toUpperCase()}
    </div>
  )
}

// ---------------------------------------------------------------------------
// MembersSection — member list with claim/unclaim/rename, invite picker, share link
// ---------------------------------------------------------------------------

function MembersSection({
  travel,
  onTravelChange,
}: {
  travel: Travel
  onTravelChange: (updated: Partial<Travel>) => void
}) {
  const { currentUser, userProfile } = useAuthStore()

  // The current user's linked TravelMember slot (null if they have no slot yet)
  const myMember = travel.members.find((m) => m.userId === currentUser?.uid) ?? null
  const isCreator = currentUser?.uid === travel.createdBy

  // "No slot" nudge: user is in memberUids (has access) but has no slot with their userId
  const hasNoSlot = !!currentUser && travel.memberUids.includes(currentUser.uid) && !myMember

  // --- Inline rename state ---
  // renamingId: travelMemberId of the slot being renamed
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const renameInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (renamingId && renameInputRef.current) {
      renameInputRef.current.focus()
      renameInputRef.current.select()
    }
  }, [renamingId])

  // --- Add unclaimed member state ---
  const [addingUnclaimed, setAddingUnclaimed] = useState(false)
  const [newMemberName, setNewMemberName] = useState('')
  const newMemberInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (addingUnclaimed && newMemberInputRef.current) newMemberInputRef.current.focus()
  }, [addingUnclaimed])

  // --- Friend picker state (for "Invite a friend") ---
  const [pickerOpen, setPickerOpen] = useState(false)
  const [friends, setFriends] = useState<Friend[]>([])
  const [friendsLoading, setFriendsLoading] = useState(false)
  const [invitedUids, setInvitedUids] = useState<Set<string>>(new Set())

  // --- Share invite link state ---
  const [shareLoading, setShareLoading] = useState(false)
  const [generatedInviteUrl, setGeneratedInviteUrl] = useState<string | null>(null)
  const [copyFeedback, setCopyFeedback] = useState(false)

  // Load friends when the picker opens (lazy — not on mount)
  useEffect(() => {
    if (!pickerOpen || !userProfile) return
    if (friends.length > 0) return  // already loaded
    setFriendsLoading(true)
    fetchFriends(userProfile.uid).then(list => {
      setFriends(list)
      setFriendsLoading(false)
    })
  }, [pickerOpen, userProfile]) // eslint-disable-line react-hooks/exhaustive-deps

  // Friends already in this travel (filter them out of the picker)
  const existingMemberUids = new Set(travel.memberUids)
  const invitableFriends = friends.filter(f => !existingMemberUids.has(f.uid))

  // ---------------------------------------------------------------------------
  // Permission checks
  // ---------------------------------------------------------------------------

  function canRename(member: TravelMember): boolean {
    if (!currentUser) return false
    if (member.userId === null) return true  // unclaimed: anyone can rename
    if (member.userId === currentUser.uid) return true  // linked user always can
    if (isCreator && member.allowRename) return true  // creator can if flag permits
    return false
  }

  function canUnclaim(member: TravelMember): boolean {
    if (!currentUser) return false
    return member.userId === currentUser.uid || isCreator
  }

  function showAllowRenameToggle(member: TravelMember): boolean {
    if (!currentUser) return false
    if (member.userId === null) return false  // toggle only relevant for claimed slots
    return member.userId === currentUser.uid || isCreator
  }

  // ---------------------------------------------------------------------------
  // Action handlers
  // ---------------------------------------------------------------------------

  async function handleRenameCommit(member: TravelMember) {
    const trimmed = renameValue.trim()
    setRenamingId(null)
    if (!trimmed || trimmed === member.displayName) return
    await renameTravelMember(travel.travelId, member.travelMemberId, trimmed, travel.members)
    onTravelChange({
      members: travel.members.map((m) =>
        m.travelMemberId === member.travelMemberId ? { ...m, displayName: trimmed } : m,
      ),
    })
  }

  async function handleClaim(member: TravelMember) {
    if (!currentUser) return
    await claimTravelMember(travel.travelId, member.travelMemberId, currentUser.uid, travel.members)
    // Transfer semantics: null any slot the user previously owned, then set this one
    onTravelChange({
      members: travel.members.map((m) => {
        if (m.travelMemberId === member.travelMemberId) return { ...m, userId: currentUser.uid }
        if (m.userId === currentUser.uid) return { ...m, userId: null }
        return m
      }),
    })
  }

  async function handleUnclaim(member: TravelMember) {
    await unclaimTravelMember(travel.travelId, member.travelMemberId, travel.members)
    // memberUids is NOT modified — access is retained
    onTravelChange({
      members: travel.members.map((m) =>
        m.travelMemberId === member.travelMemberId ? { ...m, userId: null } : m,
      ),
    })
  }

  async function handleAllowRenameToggle(member: TravelMember) {
    await setMemberAllowRename(travel.travelId, member.travelMemberId, !member.allowRename, travel.members)
    onTravelChange({
      members: travel.members.map((m) =>
        m.travelMemberId === member.travelMemberId ? { ...m, allowRename: !m.allowRename } : m,
      ),
    })
  }

  async function handleAddUnclaimed() {
    const trimmed = newMemberName.trim()
    if (!trimmed) return
    const newMember = await addUnclaimedMember(travel.travelId, trimmed, travel.members)
    onTravelChange({ members: [...travel.members, newMember] })
    setNewMemberName('')
    setAddingUnclaimed(false)
  }

  async function handleSendTravelInvite(toUid: string) {
    if (!userProfile) return
    setInvitedUids(prev => new Set(prev).add(toUid))
    await sendTravelInvite(userProfile, toUid, travel.travelId, travel.name)
  }

  async function handleShareLink() {
    if (!userProfile) return
    setShareLoading(true)
    try {
      const inviteId = await createShareableInvite(
        userProfile, 'travel_member', travel.travelId, travel.name,
      )
      const url = `${window.location.origin}/invite/${inviteId}`
      setGeneratedInviteUrl(url)
      try {
        await navigator.clipboard.writeText(url)
        setCopyFeedback(true)
        setTimeout(() => setCopyFeedback(false), 2500)
      } catch {
        // clipboard may be unavailable; user can copy manually from the displayed URL
      }
    } catch {
      // invite creation failed — ignore silently
    } finally {
      setShareLoading(false)
    }
  }

  async function handleCopyInviteUrl() {
    if (!generatedInviteUrl) return
    await navigator.clipboard.writeText(generatedInviteUrl)
    setCopyFeedback(true)
    setTimeout(() => setCopyFeedback(false), 2500)
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="flex flex-col gap-3">

      {/* "No slot" nudge — shown when user has travel access but no claimed slot */}
      {hasNoSlot && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
          You haven&apos;t claimed a slot yet — pick who you are below.
        </div>
      )}

      {/* Member list */}
      <ul className="flex flex-col gap-1.5">
        {travel.members.map((member) => {
          const isMine = member.userId === currentUser?.uid
          const isUnclaimed = member.userId === null
          const isRenaming = renamingId === member.travelMemberId

          return (
            <li
              key={member.travelMemberId}
              className="flex flex-col gap-2 rounded-lg border bg-card px-3 py-2.5"
            >
              {/* Top row: avatar + name/rename + sub-label */}
              <div className="flex items-center gap-2">
                <MemberAvatar member={member} />

                <div className="flex-1 min-w-0">
                  {/* Inline rename input or display name */}
                  {isRenaming ? (
                    <input
                      ref={renameInputRef}
                      type="text"
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      onBlur={() => handleRenameCommit(member)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleRenameCommit(member)
                        if (e.key === 'Escape') setRenamingId(null)
                      }}
                      className="w-full rounded-md border bg-background px-2 py-0.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                  ) : (
                    <p className="text-sm font-medium truncate">{member.displayName}</p>
                  )}

                  {/* Sub-label: "You", "Linked account", or "Unclaimed" */}
                  <p className="text-xs text-muted-foreground">
                    {isMine ? 'You' : isUnclaimed ? 'Unclaimed' : 'Linked account'}
                    {member.userId === travel.createdBy && (
                      <span className="ml-1 rounded-full bg-muted px-1.5 py-0.5 text-[10px]">creator</span>
                    )}
                  </p>
                </div>

                {/* Rename button — shown when permission exists and not currently renaming */}
                {!isRenaming && canRename(member) && (
                  <button
                    type="button"
                    onClick={() => { setRenamingId(member.travelMemberId); setRenameValue(member.displayName) }}
                    aria-label={`Rename ${member.displayName}`}
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  >
                    ✏️
                  </button>
                )}
              </div>

              {/* Action buttons row — only shown when relevant */}
              {(isUnclaimed || canUnclaim(member) || showAllowRenameToggle(member)) && (
                <div className="flex flex-wrap gap-1.5 pl-10">
                  {/* Claim button — only on unclaimed slots */}
                  {isUnclaimed && (
                    <button
                      type="button"
                      onClick={() => handleClaim(member)}
                      className="rounded-md border border-primary px-2 py-0.5 text-xs font-medium text-primary transition-colors hover:bg-primary/10"
                    >
                      Claim — this is me
                    </button>
                  )}

                  {/* Unclaim button — only shown to the linked user or creator */}
                  {!isUnclaimed && canUnclaim(member) && (
                    <button
                      type="button"
                      onClick={() => handleUnclaim(member)}
                      className="rounded-md border border-muted-foreground/40 px-2 py-0.5 text-xs text-muted-foreground transition-colors hover:border-destructive hover:text-destructive"
                    >
                      {isMine ? 'Unlink my account' : 'Unlink'}
                    </button>
                  )}

                  {/* allowRename toggle — only on claimed slots for the linked user or creator */}
                  {showAllowRenameToggle(member) && (
                    <button
                      type="button"
                      onClick={() => handleAllowRenameToggle(member)}
                      className="rounded-md border border-muted-foreground/40 px-2 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-muted"
                    >
                      {member.allowRename ? '🔓 Others can rename' : '🔒 Rename locked'}
                    </button>
                  )}
                </div>
              )}
            </li>
          )
        })}
      </ul>

      {/* Add person without account — dashed button + inline input */}
      {!addingUnclaimed ? (
        <button
          type="button"
          onClick={() => setAddingUnclaimed(true)}
          className="flex items-center gap-2 rounded-lg border border-dashed px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent/20"
        >
          <span>+</span>
          Add person without account
        </button>
      ) : (
        <div className="flex items-center gap-2 rounded-lg border border-dashed px-3 py-2">
          <input
            ref={newMemberInputRef}
            type="text"
            value={newMemberName}
            onChange={(e) => setNewMemberName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleAddUnclaimed()
              if (e.key === 'Escape') { setAddingUnclaimed(false); setNewMemberName('') }
            }}
            placeholder="Their name…"
            className="min-w-0 flex-1 rounded-md border bg-background px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <Button type="button" size="sm" onClick={handleAddUnclaimed} disabled={!newMemberName.trim()}>
            Add
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={() => { setAddingUnclaimed(false); setNewMemberName('') }}>
            ✕
          </Button>
        </div>
      )}

      {/* Invite a friend (collapsible friend picker) */}
      <div className="flex flex-col gap-2">
        <button
          type="button"
          onClick={() => setPickerOpen(o => !o)}
          className="flex items-center gap-2 rounded-lg border border-dashed px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent/20"
        >
          <UserPlus className="h-4 w-4" />
          Invite a friend
          <span className="ml-auto text-xs">{pickerOpen ? '▲' : '▼'}</span>
        </button>

        {pickerOpen && (
          <div className="rounded-lg border p-2">
            {friendsLoading && (
              <p className="py-2 text-center text-xs text-muted-foreground">Loading friends…</p>
            )}
            {!friendsLoading && invitableFriends.length === 0 && (
              <p className="py-2 text-center text-xs text-muted-foreground">
                {friends.length === 0
                  ? 'No friends yet. Add friends from your profile page.'
                  : 'All your friends are already in this travel.'}
              </p>
            )}
            {!friendsLoading && invitableFriends.map(friend => {
              const alreadyInvited = invitedUids.has(friend.uid)
              return (
                <div key={friend.uid} className="flex items-center gap-2 rounded px-2 py-1.5">
                  <div
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
                    style={{ backgroundColor: `hsl(${avatarHue(friend.uid)}, 55%, 50%)` }}
                  >
                    {(friend.displayName || '?').charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{friend.displayName}</p>
                    {friend.nametag && (
                      <p className="text-xs text-muted-foreground">@{friend.nametag}</p>
                    )}
                  </div>
                  {alreadyInvited ? (
                    <span className="flex items-center gap-1 text-xs text-green-600">
                      <Check className="h-3 w-3" /> Invited
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleSendTravelInvite(friend.uid)}
                      className="flex items-center gap-1 text-xs text-primary hover:underline"
                    >
                      <UserPlus className="h-3 w-3" />
                      Invite
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Share invite link */}
      <div className="flex flex-col gap-2">
        <button
          type="button"
          onClick={handleShareLink}
          disabled={shareLoading}
          className="flex items-center gap-2 rounded-lg border border-dashed px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent/20 disabled:opacity-50"
        >
          <Share2 className="h-4 w-4" />
          {shareLoading ? 'Creating link…' : 'Generate invite link'}
        </button>

        {/* Show the generated URL with a copy button — only visible after link is created */}
        {generatedInviteUrl && (
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2">
              <span className="flex-1 min-w-0 truncate text-xs text-muted-foreground font-mono">
                {generatedInviteUrl}
              </span>
              <button
                type="button"
                onClick={handleCopyInviteUrl}
                className="shrink-0 text-xs text-primary hover:underline"
              >
                {copyFeedback ? 'Copied!' : 'Copy'}
              </button>
            </div>
            <p className="text-xs text-muted-foreground pl-1">
              Anyone with this link can join this travel.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

interface ParametersTabProps {
  travel: Travel
  transactions: TransactionWithStatus[]
  onTravelChange: (updated: Partial<Travel>) => void
}

export function ParametersTab({ travel, transactions, onTravelChange }: ParametersTabProps) {
  const navigate = useNavigate()
  const { currentUser } = useAuthStore()
  const [name, setName] = useState(travel.name)
  const [emoji, setEmoji] = useState(travel.emoji ?? '')

  useEffect(() => { setName(travel.name) }, [travel.name])
  useEffect(() => { setEmoji(travel.emoji ?? '') }, [travel.emoji])

  async function handleNameBlur() {
    const trimmed = name.trim()
    if (!trimmed || trimmed === travel.name) return
    await updateTravelMeta(travel.travelId, { name: trimmed })
    onTravelChange({ name: trimmed })
  }

  async function handleEmojiBlur() {
    const trimmed = emoji.trim()
    if (trimmed === (travel.emoji ?? '')) return
    await updateTravelMeta(travel.travelId, { emoji: trimmed || undefined })
    onTravelChange({ emoji: trimmed || undefined })
  }

  // Merge transaction-derived cities into the stored cities list (read-only auto-seeding)
  function mergeCitiesFromTransactions(stored: LabeledItem[]): LabeledItem[] {
    const existing = new Set(stored.map((i) => i.label.toLowerCase()))
    const derived: LabeledItem[] = []
    transactions.forEach((tx) => {
      if (tx.city && !existing.has(tx.city.toLowerCase())) {
        existing.add(tx.city.toLowerCase())
        derived.push({ id: nanoid(8), label: tx.city })
      }
    })
    return [...stored, ...derived]
  }

  const effectiveCities = mergeCitiesFromTransactions(travel.cities ?? [])

  function handleListChange(field: keyof Pick<Travel, 'categories' | 'paymentMethods' | 'countries' | 'cities'>) {
    return (items: LabeledItem[]) => onTravelChange({ [field]: items })
  }

  async function handleCurrenciesChange(codes: string[]) {
    await updateTravelCurrencies(travel.travelId, codes)
    onTravelChange({ currencies: codes })
  }

  // ---------------------------------------------------------------------------
  // Archive / Leave / Delete logic
  // ---------------------------------------------------------------------------

  const uid = currentUser?.uid ?? ''
  const isArchived = (travel.archivedByUids ?? []).includes(uid)

  // Solo check based on memberUids (access-control array).
  // A user in memberUids may not have claimed a slot yet, but they still count
  // as a real user with access to the travel.
  const isOnlyUser = travel.memberUids.length <= 1

  // State for the leave/delete confirmation dialog
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [actionInProgress, setActionInProgress] = useState(false)

  // Archive button: loading spinner + brief "Done!" feedback
  const [archiving, setArchiving] = useState(false)
  const [archiveDone, setArchiveDone] = useState(false)

  async function handleArchiveToggle() {
    setArchiving(true)
    try {
      if (isArchived) {
        await unarchiveTravel(travel.travelId, uid)
        onTravelChange({ archivedByUids: (travel.archivedByUids ?? []).filter((u) => u !== uid) })
      } else {
        await archiveTravel(travel.travelId, uid)
        onTravelChange({ archivedByUids: [...(travel.archivedByUids ?? []), uid] })
      }
      // Brief "Done!" feedback before label updates
      setArchiveDone(true)
      setTimeout(() => setArchiveDone(false), 10000)
    } finally {
      setArchiving(false)
    }
  }

  // Executes leave (multi-user) or delete (solo / last user)
  async function handleLeaveOrDelete() {
    setActionInProgress(true)
    try {
      if (isOnlyUser) {
        // Solo or last user — hard-delete the entire travel + transactions
        await deleteTravel(travel.travelId)
      } else {
        // Multi-user — leave: remove self from memberUids, unclaim slot
        await leaveTravel(travel.travelId, uid, travel.members, travel.memberUids, travel.createdBy)
      }
      // Navigate back to travels list after leaving/deleting
      navigate('/travels')
    } catch (err) {
      console.error('[ParametersTab] leave/delete failed:', err)
      setActionInProgress(false)
    }
  }

  return (
    <div className="flex flex-col gap-6 pb-8">

      {/* Travel identity */}
      <Section title="Travel">
        <div className="flex gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-muted-foreground">Emoji</label>
            <EmojiInput value={emoji} onChange={setEmoji} onBlur={handleEmojiBlur} ariaLabel="Travel emoji" />
            <span className="text-[10px] text-muted-foreground">Tap 🌐</span>
          </div>
          <div className="flex flex-1 flex-col gap-1">
            <label className="text-xs font-medium text-muted-foreground">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={handleNameBlur}
              placeholder="Travel name"
              className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
        </div>
      </Section>

      {/* Members — MembersSection receives onTravelChange so it can update members array */}
      <Section title="Members">
        <MembersSection travel={travel} onTravelChange={onTravelChange} />
      </Section>

      {/* Currencies */}
      <Section title="Currencies">
        {/* Read-only main currency display — locked after creation (editable + recompute is v2). */}
        {(() => {
          const mc = getTravelMainCurrency(travel)
          const match = ALL_CURRENCIES.find(([code]) => code === mc)
          const label = match ? `${mc} (${match[1]}) — ${match[2]}` : mc
          return (
            <div className="flex items-center justify-between rounded-lg border bg-muted/30 px-3 py-2">
              <div>
                <p className="text-sm font-medium">Main currency</p>
                <p className="text-xs text-muted-foreground">{label}</p>
              </div>
              <span className="rounded-full border px-2 py-0.5 text-[10px] text-muted-foreground">
                set at creation — cannot be modified
              </span>
            </div>
          )
        })()}
        <CurrencyPicker
          selected={travel.currencies ?? []}
          onChange={handleCurrenciesChange}
          lockedCurrency={getTravelMainCurrency(travel)}
        />
      </Section>

      {/* Exchange Rates — editable default rates for each currency vs mainCurrency */}
      {(() => {
        const mc = getTravelMainCurrency(travel)
        // Show all currencies in the travel's list except the main currency.
        const currenciesWithRates = (travel.currencies ?? []).filter((c) => c !== mc)

        if (currenciesWithRates.length === 0) return null

        return (
          <Section title="Exchange rates">
            <p className="text-xs text-muted-foreground">
              Default rates for new transactions. Editing a rate only affects future transactions.
            </p>
            {currenciesWithRates.map((code) => {
              // Read from travel.defaultRates, fall back to hardcoded cross-rate
              const storedRate = travel.defaultRates?.[code]
              const rate = storedRate ?? getExchangeRate(code, mc)
              return (
                <ExchangeRateRow
                  key={code}
                  code={code}
                  mainCurrency={mc}
                  rate={rate}
                  travelId={travel.travelId}
                  onRateChange={(c, newRate) => {
                    // Optimistic local update so other components see the change immediately
                    onTravelChange({
                      defaultRates: { ...(travel.defaultRates ?? {}), [c]: newRate },
                    })
                  }}
                />
              )
            })}
          </Section>
        )
      })()}

      {/* Categories */}
      <Section title="Categories">
        <EditableLabeledList
          items={travel.categories ?? []}
          travelId={travel.travelId}
          field="categories"
          placeholder="Category name…"
          onItemsChange={handleListChange('categories')}
        />
      </Section>

      {/* Payment methods */}
      <Section title="Payment methods">
        <EditableLabeledList
          items={travel.paymentMethods ?? []}
          travelId={travel.travelId}
          field="paymentMethods"
          placeholder="Payment method…"
          onItemsChange={handleListChange('paymentMethods')}
        />
      </Section>

      {/* Countries — CountryPicker replaces EditableLabeledList */}
      <Section title="Countries">
        <CountryPicker
          selected={travel.countries ?? []}
          travelId={travel.travelId}
          onSelectedChange={handleListChange('countries')}
        />
      </Section>

      {/* Cities — still editable list, auto-seeded from transactions */}
      <Section title="Cities">
        <EditableLabeledList
          items={effectiveCities}
          travelId={travel.travelId}
          field="cities"
          placeholder="City name…"
          onItemsChange={handleListChange('cities')}
        />
      </Section>

      {/* Feedback — embedded form for quick beta feedback */}
      <Section title="Feedback">
        <FeedbackForm source="ParametersTab" />
      </Section>

      {/* ----------------------------------------------------------------- */}
      {/* Manage travel — archive and leave/delete actions                   */}
      {/* ----------------------------------------------------------------- */}
      <Section title="Manage travel">
        <div className="flex flex-col gap-2">
          {/* Archive / Unarchive — with loading spinner and "Done!" feedback */}
          <Button
            type="button"
            variant="outline"
            className="w-full justify-start"
            onClick={handleArchiveToggle}
            disabled={archiving}
          >
            {archiving
              ? (isArchived ? 'Unarchiving…' : 'Archiving…')
              : archiveDone
                ? (isArchived ? 'Archived!' : 'Unarchived!')
                : (isArchived ? 'Unarchive this travel' : 'Archive this travel')}
          </Button>

          {/* Visual confirmation banner after archiving */}
          {archiveDone && (
            <div className={`rounded-lg px-3 py-2 text-sm font-medium ${
              isArchived
                ? 'bg-amber-50 text-amber-800 border border-amber-200 dark:bg-amber-950 dark:text-amber-200 dark:border-amber-800'
                : 'bg-green-50 text-green-800 border border-green-200 dark:bg-green-950 dark:text-green-200 dark:border-green-800'
            }`}>
              {isArchived
                ? 'This travel is now archived. It will appear in your "Archived" section.'
                : 'This travel has been unarchived and is back in your active list.'}
            </div>
          )}

          {/* Leave / Delete — opens confirmation dialog */}
          <Button
            type="button"
            variant="destructive"
            className="w-full justify-start"
            onClick={() => setConfirmOpen(true)}
          >
            {isOnlyUser ? 'Delete this travel' : 'Leave this travel'}
          </Button>
        </div>

        {/* Explanation text */}
        <p className="text-xs text-muted-foreground">
          {isOnlyUser
            ? 'You are the only user. Deleting will permanently remove this travel and all its transactions.'
            : 'Leaving will remove you from the travel. Other members will still have access. Your past transactions will be preserved.'}
        </p>
      </Section>

      {/* Confirmation dialog for leave/delete */}
      <AlertDialog open={confirmOpen} onOpenChange={(open) => { if (!open) setConfirmOpen(false) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {isOnlyUser ? 'Delete this travel?' : 'Leave this travel?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {isOnlyUser
                ? 'This will permanently delete the travel and all its transactions. This action cannot be undone.'
                : 'You will lose access to this travel. Your expense history will be preserved for other members.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={actionInProgress}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleLeaveOrDelete}
              disabled={actionInProgress}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              {actionInProgress
                ? (isOnlyUser ? 'Deleting…' : 'Leaving…')
                : (isOnlyUser ? 'Delete' : 'Leave')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </div>
  )
}
