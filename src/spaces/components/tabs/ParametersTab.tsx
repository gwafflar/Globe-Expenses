// src/spaces/components/tabs/ParametersTab.tsx

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { nanoid } from 'nanoid'
import type { LabeledItem, Space, SpaceConfig, SpaceMember } from '@/spaces/types'
import { getSpaceMainCurrency } from '@/spaces/types'
import { InlineCurrencyControl } from '@/shared/components/CurrencySelect'
import { getSpaceConfig } from '@/spaces/config'
import { FieldsEditor } from '@/spaces/components/FieldsEditor'
import {
  updateSpaceCurrencies,
  updateSpaceList,
  updateSpaceMeta,
  updateSpaceDefaultRate,
  updateSpaceConfig,
  addUnclaimedMember,
  renameSpaceMember,
  claimSpaceMember,
  setMemberAllowRename,
  archiveSpace,
  unarchiveSpace,
  leaveSpace,
  deleteSpace,
  mergeMembers,
} from '@/spaces/services/spaceService'
import type { TransactionWithStatus } from '@/transactions/hooks/useTransactions'
import { useAuthStore } from '@/auth/store/useAuthStore'
import {
  fetchFriends,
  sendSpaceInvite,
  createShareableInvite,
  searchByNametag,
} from '@/friends/services/friendService'
import type { Friend, SearchUser } from '@/friends/types'
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
import { Share2, Check } from 'lucide-react'
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

export function CurrencyPicker({
  selected,
  onChange,
  lockedCurrency,
}: {
  selected: string[]
  onChange: (codes: string[]) => void
  // The space's mainCurrency — always checked, cannot be unchecked.
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
// ExchangeRateEditor — editable exchange rates for each currency in the space.
//
// Shows all currencies in the space's currencies list (except mainCurrency),
// each with an editable rate. The rate can be entered in either direction:
//   - "1 local = X main" (the stored format)
//   - "1 main = X local" (the inverse, for convenience)
// Changing one input auto-updates the other.
// ---------------------------------------------------------------------------

function ExchangeRateRow({
  code,
  mainCurrency,
  rate,
  spaceId,
  onRateChange,
}: {
  code: string
  mainCurrency: string
  rate: number         // stored rate: 1 local = rate mainCurrency
  spaceId: string
  onRateChange: (code: string, newRate: number) => void
}) {
  // "1 local = X main" (the stored format)
  const [localToMain, setLocalToMain] = useState(rate.toString())
  // "1 main = X local" (the inverse)
  const [mainToLocal, setMainToLocal] = useState(
    rate > 0 ? parseFloat((1 / rate).toPrecision(6)).toString() : ''
  )

  // Sync from props when space.defaultRates changes externally
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
      updateSpaceDefaultRate(spaceId, code, parsed).catch(console.error)
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
  selected,   // country names currently in the space's countries list
  spaceId,
  onSelectedChange,
}: {
  selected: LabeledItem[]
  spaceId: string
  onSelectedChange: (items: LabeledItem[]) => void
}) {
  // Own open/search state — avoids delegating to CollapsiblePicker so both
  // states live in the same component instance and are never reset by re-renders
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const listRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const selectedNames = new Set(selected.map((i) => i.label.toLowerCase()))

  const filtered = ALL_COUNTRIES.filter(([, , name]) =>
    name.toLowerCase().includes(search.toLowerCase())
  )

  function handleToggle() {
    const next = !open
    setOpen(next)
    // Auto-focus the search input when opening
    if (next) setTimeout(() => inputRef.current?.focus(), 0)
  }

  function handleSearch(value: string) {
    setSearch(value)
    if (listRef.current) listRef.current.scrollTop = 0
  }

  async function toggle(flag: string, name: string) {
    const lower = name.toLowerCase()
    let next: LabeledItem[]
    if (selectedNames.has(lower)) {
      next = selected.filter((i) => i.label.toLowerCase() !== lower)
    } else {
      next = [...selected, { id: nanoid(8), label: name, emoji: flag }]
    }
    onSelectedChange(next)
    await updateSpaceList(spaceId, 'countries', next)
  }

  const summary =
    selected.length === 0
      ? 'No countries selected'
      : selected.map((i) => `${i.emoji ?? '🌍'} ${i.label}`).join(', ')

  return (
    <div className="flex flex-col gap-2">
      {/* Summary / toggle button — same style as CollapsiblePicker */}
      <button
        type="button"
        onClick={handleToggle}
        className="flex items-center justify-between rounded-lg border bg-card px-3 py-2.5 text-sm transition-colors hover:bg-accent/30"
      >
        <span><span className="font-medium">Countries: </span>{summary}</span>
        <span className="text-muted-foreground text-xs">{open ? '▲' : '▼'}</span>
      </button>

      {/* Expanded content — always in the same component, never unmounted separately */}
      {open && (
        <div className="flex flex-col gap-2 rounded-lg border p-2">
          <input
            ref={inputRef}
            type="text"
            value={search}
            onChange={(e) => handleSearch(e.target.value)}
            placeholder="Search country…"
            className="w-full rounded-md border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <div ref={listRef} className="flex max-h-56 flex-col gap-0.5 overflow-y-auto">
            {filtered.length === 0 && (
              <p className="px-3 py-2 text-xs text-muted-foreground">No countries match.</p>
            )}
            {filtered.map(([, flag, name]) => {
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
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// EmojiInput
// ---------------------------------------------------------------------------

export function EmojiInput({ value, onChange, onBlur, ariaLabel }: { value: string; onChange: (v: string) => void; onBlur?: () => void; ariaLabel: string }) {
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
  spaceId: string
  field: ListField
  placeholder: string
  onItemsChange: (items: LabeledItem[]) => void
  hideEmoji?: boolean
}

function EditableLabeledList({ items, spaceId, field, placeholder, onItemsChange, hideEmoji }: EditableLabeledListProps) {
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
    await updateSpaceList(spaceId, field, next)
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
          {!hideEmoji && <EmojiInput value={item.emoji ?? ''} onChange={(v) => updateEmoji(item.id, v)} ariaLabel="Emoji" />}
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
        {!hideEmoji && <EmojiInput value={addEmoji} onChange={setAddEmoji} ariaLabel="New item emoji" />}
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
function MemberAvatar({ member }: { member: SpaceMember }) {
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
// AddMemberModal — unified 4-tab portal modal for all "add member" methods
// ---------------------------------------------------------------------------

interface AddMemberModalProps {
  tab: 'name' | 'friend' | 'username' | 'link'
  onTabChange: (tab: 'name' | 'friend' | 'username' | 'link') => void
  onClose: () => void
  // Tab: Name
  onAddUnclaimed: (name: string) => Promise<void>
  // Tab: Friend
  friends: Friend[]
  friendsLoading: boolean
  invitableFriends: Friend[]
  invitedUids: Set<string>
  onInviteFriend: (uid: string) => Promise<void>
  // Tab: Username
  usernameQuery: string
  onUsernameQueryChange: (q: string) => void
  usernameResults: SearchUser[]
  usernameSearching: boolean
  invitedByUsername: Set<string>
  onInviteByUsername: (uid: string) => Promise<void>
  existingMemberUids: Set<string>
  // Tab: Link
  shareLoading: boolean
  generatedInviteUrl: string | null
  copyFeedback: boolean
  onShareLink: () => Promise<void>
  onCopyInviteUrl: () => Promise<void>
}

function AddMemberModal({
  tab,
  onTabChange,
  onClose,
  onAddUnclaimed,
  friends,
  friendsLoading,
  invitableFriends,
  invitedUids,
  onInviteFriend,
  usernameQuery,
  onUsernameQueryChange,
  usernameResults,
  usernameSearching,
  invitedByUsername,
  onInviteByUsername,
  existingMemberUids,
  shareLoading,
  generatedInviteUrl,
  copyFeedback,
  onShareLink,
  onCopyInviteUrl,
}: AddMemberModalProps) {
  const [nameInput, setNameInput] = useState('')
  const [addingName, setAddingName] = useState(false)
  const nameInputRef = useRef<HTMLInputElement>(null)

  // Auto-focus name input when tab is "name"
  useEffect(() => {
    if (tab === 'name') nameInputRef.current?.focus()
  }, [tab])

  async function handleAddByName() {
    if (!nameInput.trim()) return
    setAddingName(true)
    try {
      await onAddUnclaimed(nameInput.trim())
      setNameInput('')
    } finally {
      setAddingName(false)
    }
  }

  const TABS = [
    { id: 'name' as const, label: 'By Name' },
    { id: 'friend' as const, label: 'Friend' },
    { id: 'username' as const, label: '@Username' },
    { id: 'link' as const, label: 'Link' },
  ]

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-lg bg-background border shadow-lg flex flex-col"
        style={{ maxHeight: '85vh' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h2 className="font-semibold">Add a member</h2>
          <button
            type="button"
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted"
          >
            ✕
          </button>
        </div>

        {/* Tab bar */}
        <div className="flex border-b">
          {TABS.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              onClick={() => onTabChange(id)}
              className={`flex-1 px-2 py-2 text-xs font-medium transition-colors ${
                tab === id
                  ? 'border-b-2 border-primary text-primary'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="flex-1 overflow-y-auto px-4 py-4">

          {/* ── Tab: By Name ── */}
          {tab === 'name' && (
            <div className="flex flex-col gap-3">
              <p className="text-xs text-muted-foreground">
                Add someone who doesn&apos;t have an account. They won&apos;t be able to log in, but you can track their share of expenses.
              </p>
              <div className="flex gap-2">
                <input
                  ref={nameInputRef}
                  type="text"
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !addingName) handleAddByName()
                  }}
                  placeholder="Their name…"
                  disabled={addingName}
                  className="min-w-0 flex-1 rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
                />
                <button
                  type="button"
                  onClick={handleAddByName}
                  disabled={!nameInput.trim() || addingName}
                  className="shrink-0 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {addingName ? '…' : 'Add'}
                </button>
              </div>
            </div>
          )}

          {/* ── Tab: Friend ── */}
          {tab === 'friend' && (
            <div className="flex flex-col gap-2">
              {friendsLoading && (
                <p className="py-4 text-center text-xs text-muted-foreground">Loading friends…</p>
              )}
              {!friendsLoading && invitableFriends.length === 0 && (
                <p className="py-4 text-center text-xs text-muted-foreground">
                  {friends.length === 0
                    ? 'No friends yet. Use the @Username tab to find people, or share the invite link.'
                    : 'All your friends are already in this space.'}
                </p>
              )}
              {!friendsLoading && invitableFriends.map(friend => {
                const alreadyInvited = invitedUids.has(friend.uid)
                return (
                  <div key={friend.uid} className="flex items-center gap-3 rounded-lg border px-3 py-2">
                    {/* Avatar */}
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
                      <span className="flex items-center gap-1 text-xs text-green-600 shrink-0">
                        <Check className="h-3 w-3" /> Invited
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => onInviteFriend(friend.uid)}
                        className="shrink-0 rounded-md border px-2 py-1 text-xs text-primary transition-colors hover:bg-primary/10"
                      >
                        Invite
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {/* ── Tab: @Username ── */}
          {tab === 'username' && (
            <div className="flex flex-col gap-3">
              <p className="text-xs text-muted-foreground">
                Search by @username. An invite will be sent — they must accept to join.
              </p>
              {/* Input only — results update as you type (debounced 300ms in parent) */}
              <div className="relative">
                <input
                  type="text"
                  value={usernameQuery}
                  onChange={(e) => onUsernameQueryChange(e.target.value)}
                  placeholder="@username…"
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring pr-8"
                />
                {usernameSearching && (
                  <div className="absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                )}
              </div>

              {/* Results */}
              {usernameResults.length > 0 && (
                <div className="flex flex-col gap-2">
                  {usernameResults.map(user => {
                    const alreadyInvited = invitedByUsername.has(user.uid)
                    const alreadyInSpace = existingMemberUids.has(user.uid)
                    return (
                      <div key={user.uid} className="flex items-center gap-3 rounded-lg border px-3 py-2">
                        <div
                          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
                          style={{ backgroundColor: `hsl(${avatarHue(user.uid)}, 55%, 50%)` }}
                        >
                          {(user.displayName || '?').charAt(0).toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{user.displayName}</p>
                          <p className="text-xs text-muted-foreground">@{user.nametag}</p>
                        </div>
                        {alreadyInSpace ? (
                          <span className="shrink-0 text-xs text-muted-foreground">In space</span>
                        ) : alreadyInvited ? (
                          <span className="flex items-center gap-1 text-xs text-green-600 shrink-0">
                            <Check className="h-3 w-3" /> Invited
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => onInviteByUsername(user.uid)}
                            className="shrink-0 rounded-md border px-2 py-1 text-xs text-primary transition-colors hover:bg-primary/10"
                          >
                            Invite
                          </button>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}

              {/* Empty state after search */}
              {!usernameSearching && usernameResults.length === 0 && usernameQuery && (
                <p className="text-center text-xs text-muted-foreground">No users found.</p>
              )}
            </div>
          )}

          {/* ── Tab: Link ── */}
          {tab === 'link' && (
            <div className="flex flex-col gap-3">
              <p className="text-xs text-muted-foreground">
                Share this link with anyone. They can join the space and become your friend.
              </p>
              {!generatedInviteUrl ? (
                <button
                  type="button"
                  onClick={onShareLink}
                  disabled={shareLoading}
                  className="flex items-center justify-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium transition-colors hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Share2 className="h-4 w-4" />
                  {shareLoading ? 'Creating link…' : 'Generate invite link'}
                </button>
              ) : (
                <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2">
                    <span className="flex-1 min-w-0 truncate text-xs text-muted-foreground font-mono">
                      {generatedInviteUrl}
                    </span>
                    <button
                      type="button"
                      onClick={onCopyInviteUrl}
                      className="shrink-0 text-xs text-primary hover:underline"
                    >
                      {copyFeedback ? '✓ Copied!' : 'Copy'}
                    </button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Anyone with this link can join this space.
                  </p>
                </div>
              )}
            </div>
          )}

        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// MembersSection — member list with claim/unclaim/rename, invite picker, share link
// ---------------------------------------------------------------------------

function MembersSection({
  space,
  onSpaceChange,
}: {
  space: Space
  onSpaceChange: (updated: Partial<Space>) => void
}) {
  const { currentUser, userProfile } = useAuthStore()

  // The current user's linked SpaceMember slot (null if they have no slot yet)
  const myMember = space.members.find((m) => m.userId === currentUser?.uid) ?? null
  const isCreator = currentUser?.uid === space.createdBy

  // "No slot" nudge: user is in memberUids (has access) but has no slot with their userId
  const hasNoSlot = !!currentUser && space.memberUids.includes(currentUser.uid) && !myMember

  // Solo space check: only one member slot total, and no unclaimed slots (truly just the user)
  // Used for simplified UI in MembersSection (show "Members: You" instead of full management)
  const isSoloSpace = space.members.length === 1 && !space.members.some((m) => m.userId === null)

  // --- Inline rename state ---
  // renamingId: travelMemberId of the slot being renamed
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const renameInputRef = useRef<HTMLInputElement>(null)

  // --- "This is not me" unlink flow state ---
  // unlinkingMemberId: which member the user is trying to unlink from
  const [unlinkingMemberId, setUnlinkingMemberId] = useState<string | null>(null)
  const [unlinkNewMemberName, setUnlinkNewMemberName] = useState('')
  const [unlinkLoading, setUnlinkLoading] = useState(false)
  const unlinkNewMemberInputRef = useRef<HTMLInputElement>(null)


  useEffect(() => {
    if (renamingId && renameInputRef.current) {
      renameInputRef.current.focus()
      renameInputRef.current.select()
    }
  }, [renamingId])

  // --- Unified "Add member" modal state ---
  // Single modal replaces the old inline add + collapsible friend picker + share link
  const [addMemberOpen, setAddMemberOpen] = useState(false)
  const [addMemberTab, setAddMemberTab] = useState<'name' | 'friend' | 'username' | 'link'>('name')

  // --- Friend invite state (used in "Friend" tab of modal) ---
  const [friends, setFriends] = useState<Friend[]>([])
  const [friendsLoading, setFriendsLoading] = useState(false)
  const [invitedUids, setInvitedUids] = useState<Set<string>>(new Set())

  // --- Share invite link state (used in "Link" tab of modal) ---
  const [shareLoading, setShareLoading] = useState(false)
  const [generatedInviteUrl, setGeneratedInviteUrl] = useState<string | null>(null)
  const [copyFeedback, setCopyFeedback] = useState(false)

  // --- Username search state (used in "@Username" tab of modal) ---
  const [usernameQuery, setUsernameQuery] = useState('')
  const [usernameResults, setUsernameResults] = useState<SearchUser[]>([])
  const [usernameSearching, setUsernameSearching] = useState(false)
  const [invitedByUsername, setInvitedByUsername] = useState<Set<string>>(new Set())
  const usernameSearchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Debounced username search — fires 300ms after each keystroke, same as ProfilePage
  useEffect(() => {
    if (usernameSearchTimer.current) clearTimeout(usernameSearchTimer.current)
    if (!currentUser || usernameQuery.trim() === '') {
      setUsernameResults([])
      setUsernameSearching(false)
      return
    }
    setUsernameSearching(true)
    usernameSearchTimer.current = setTimeout(async () => {
      const results = await searchByNametag(usernameQuery.trim(), currentUser.uid)
      setUsernameResults(results)
      setUsernameSearching(false)
    }, 300)
    return () => {
      if (usernameSearchTimer.current) clearTimeout(usernameSearchTimer.current)
    }
  }, [usernameQuery, currentUser]) // eslint-disable-line react-hooks/exhaustive-deps

  // Load friends lazily when the modal is open on the "friend" tab
  useEffect(() => {
    if (!addMemberOpen || addMemberTab !== 'friend' || !userProfile) return
    if (friends.length > 0) return  // already loaded
    setFriendsLoading(true)
    fetchFriends(userProfile.uid).then(list => {
      setFriends(list)
      setFriendsLoading(false)
    })
  }, [addMemberOpen, addMemberTab, userProfile]) // eslint-disable-line react-hooks/exhaustive-deps

  // Friends already in this space (filter them out of the picker)
  const existingMemberUids = new Set(space.memberUids)
  const invitableFriends = friends.filter(f => !existingMemberUids.has(f.uid))

  // --- Merge members modal state ---
  const [mergeModalOpen, setMergeModalOpen] = useState(false)
  // Step 1: select two members; Step 2: choose which to keep and confirm
  const [mergeStep, setMergeStep] = useState<'select' | 'confirm'>('select')
  const [mergeSelected, setMergeSelected] = useState<Set<string>>(new Set())
  const [mergeKeepId, setMergeKeepId] = useState<string | null>(null)
  const [mergeLoading, setMergeLoading] = useState(false)
  const [mergeDone, setMergeDone] = useState<{ keptName: string; deletedName: string } | null>(null)

  function openMergeModal() {
    setMergeStep('select')
    setMergeSelected(new Set())
    setMergeKeepId(null)
    setMergeLoading(false)
    setMergeDone(null)
    setMergeModalOpen(true)
  }

  function toggleMergeSelect(travelMemberId: string) {
    setMergeSelected(prev => {
      const next = new Set(prev)
      if (next.has(travelMemberId)) {
        next.delete(travelMemberId)
      } else if (next.size < 2) {
        next.add(travelMemberId)
      }
      return next
    })
  }

  function proceedToConfirm() {
    const [a, b] = Array.from(mergeSelected)
    // Default: keep the claimed one if one is claimed; otherwise keep the first selected
    const memberA = space.members.find(m => m.travelMemberId === a)
    const memberB = space.members.find(m => m.travelMemberId === b)
    const defaultKeep = (memberA?.userId !== null ? a : memberB?.userId !== null ? b : a)
    setMergeKeepId(defaultKeep)
    setMergeStep('confirm')
  }

  async function handleMerge() {
    if (!mergeKeepId) return
    const [a, b] = Array.from(mergeSelected)
    const deleteId = mergeKeepId === a ? b : a
    const keptMember = space.members.find(m => m.travelMemberId === mergeKeepId)
    const deletedMember = space.members.find(m => m.travelMemberId === deleteId)
    if (!keptMember || !deletedMember) return

    setMergeLoading(true)
    try {
      await mergeMembers(space.spaceId, mergeKeepId, deleteId, space.members, space.createdBy)
      onSpaceChange({ members: space.members.filter(m => m.travelMemberId !== deleteId) })
      setMergeDone({ keptName: keptMember.displayName, deletedName: deletedMember.displayName })
    } finally {
      setMergeLoading(false)
    }
  }

  // ---------------------------------------------------------------------------
  // Helper: format member display name
  // ---------------------------------------------------------------------------

  // Returns member name in format "Marc (Marcus)" where Marc is current displayName
  // and Marcus is their account's original displayName. For now, shows account
  // name only for current user (who we have displayName for). Future: store
  // originalDisplayName in SpaceMember schema when claiming.
  function getMemberDisplayLabel(member: SpaceMember): string {
    if (member.userId === null) return member.displayName  // unclaimed: no account
    if (member.userId === currentUser?.uid && userProfile) {
      return `${member.displayName} (${userProfile.displayName})`  // we have current user's display name
    }
    // For other claimed members, we don't have their account displayName yet
    // (future: store originalDisplayName in SpaceMember when claiming)
    return member.displayName
  }

  // ---------------------------------------------------------------------------
  // Permission checks
  // ---------------------------------------------------------------------------

  function canRename(member: SpaceMember): boolean {
    if (!currentUser) return false
    if (member.userId === null) return true  // unclaimed: anyone can rename
    if (member.userId === currentUser.uid) return true  // linked user always can rename themselves
    // If member locked rename, no one else can rename (including creator)
    if (!member.allowRename) return false
    // Otherwise: anyone can rename if the member didn't lock it
    return true
  }

  function canUnclaim(member: SpaceMember): boolean {
    if (!currentUser) return false
    return member.userId === currentUser.uid || isCreator
  }

  function showAllowRenameToggle(member: SpaceMember): boolean {
    if (!currentUser) return false
    if (member.userId === null) return false  // toggle only relevant for claimed slots
    return member.userId === currentUser.uid || isCreator
  }

  // ---------------------------------------------------------------------------
  // Action handlers
  // ---------------------------------------------------------------------------

  async function handleRenameCommit(member: SpaceMember) {
    const trimmed = renameValue.trim()
    setRenamingId(null)
    if (!trimmed || trimmed === member.displayName) return
    await renameSpaceMember(space.spaceId, member.travelMemberId, trimmed, space.members)
    onSpaceChange({
      members: space.members.map((m) =>
        m.travelMemberId === member.travelMemberId ? { ...m, displayName: trimmed } : m,
      ),
    })
  }

  async function handleClaim(member: SpaceMember) {
    if (!currentUser) return

    // If user already has a claimed slot, they must use the unlink flow first
    // (click "This is not me" on their current slot to choose a different one)
    if (myMember && myMember.travelMemberId !== member.travelMemberId) {
      setUnlinkingMemberId(myMember.travelMemberId)
      setUnlinkNewMemberName('')
      return
    }

    // User has no claimed slot, or is claiming the same slot — proceed with claim
    await claimSpaceMember(space.spaceId, member.travelMemberId, currentUser.uid, space.members)
    // Transfer semantics: null any slot the user previously owned, then set this one
    onSpaceChange({
      members: space.members.map((m) => {
        if (m.travelMemberId === member.travelMemberId) return { ...m, userId: currentUser.uid }
        if (m.userId === currentUser.uid) return { ...m, userId: null }
        return m
      }),
    })
  }

  // Opens the "This is not me" modal — forces user to choose another member or create new
  function handleThisIsNotMe(member: SpaceMember) {
    setUnlinkingMemberId(member.travelMemberId)
    setUnlinkNewMemberName('')
  }

  // User claims an unclaimed member from the unlink modal
  async function handleUnlinkAndClaim(unclaimedMemberId: string) {
    if (!currentUser || !unlinkingMemberId) return

    // If user clicked on themselves (same member), just cancel the modal
    if (myMember?.travelMemberId === unclaimedMemberId) {
      setUnlinkingMemberId(null)
      setUnlinkNewMemberName('')
      return
    }

    setUnlinkLoading(true)
    try {
      // Claim the unclaimed member (old slot auto-unlinks via transfer semantics)
      await claimSpaceMember(space.spaceId, unclaimedMemberId, currentUser.uid, space.members)
      onSpaceChange({
        members: space.members.map((m) => {
          if (m.travelMemberId === unclaimedMemberId) return { ...m, userId: currentUser.uid }
          if (m.userId === currentUser.uid) return { ...m, userId: null }
          return m
        }),
      })
      setUnlinkingMemberId(null)
      setUnlinkNewMemberName('')
    } finally {
      setUnlinkLoading(false)
    }
  }

  // User creates new unclaimed member and claims it from the unlink modal
  async function handleUnlinkAndCreateNew() {
    if (!currentUser || !unlinkingMemberId) return
    const trimmed = unlinkNewMemberName.trim()
    if (!trimmed) return

    setUnlinkLoading(true)
    try {
      const newMember = await addUnclaimedMember(space.spaceId, trimmed, space.members)
      // Claim the newly created member (old slot auto-unlinks via transfer semantics)
      await claimSpaceMember(space.spaceId, newMember.travelMemberId, currentUser.uid, space.members)
      onSpaceChange({
        members: space.members.map((m) => {
          if (m.travelMemberId === newMember.travelMemberId) return { ...m, userId: currentUser.uid }
          if (m.userId === currentUser.uid) return { ...m, userId: null }
          return m
        }),
      })
      setUnlinkingMemberId(null)
      setUnlinkNewMemberName('')
    } finally {
      setUnlinkLoading(false)
    }
  }

  async function handleAllowRenameToggle(member: SpaceMember) {
    await setMemberAllowRename(space.spaceId, member.travelMemberId, !member.allowRename, space.members)
    onSpaceChange({
      members: space.members.map((m) =>
        m.travelMemberId === member.travelMemberId ? { ...m, allowRename: !m.allowRename } : m,
      ),
    })
  }

  // Add unclaimed member (instant — no invite needed, just creates a slot)
  async function handleAddUnclaimed(name: string) {
    const trimmed = name.trim()
    if (!trimmed) return
    const newMember = await addUnclaimedMember(space.spaceId, trimmed, space.members)
    onSpaceChange({ members: [...space.members, newMember] })
    setAddMemberOpen(false)
  }

  // Send a space invite to a friend (friend tab)
  async function handleSendSpaceInvite(toUid: string) {
    if (!userProfile) return
    setInvitedUids(prev => new Set(prev).add(toUid))
    await sendSpaceInvite(userProfile, toUid, space.spaceId, space.name)
  }

  // Send a space invite via username search result (username tab)
  async function handleSendSpaceInviteByUsername(toUid: string) {
    if (!userProfile) return
    setInvitedByUsername(prev => new Set(prev).add(toUid))
    await sendSpaceInvite(userProfile, toUid, space.spaceId, space.name)
  }

  // Generate shareable invite link (link tab) — also auto-copies to clipboard
  async function handleShareLink() {
    if (!userProfile) return
    setShareLoading(true)
    try {
      const inviteId = await createShareableInvite(
        userProfile, 'travel_member', space.spaceId, space.name,
      )
      const url = `${window.location.origin}/invite/${inviteId}`
      setGeneratedInviteUrl(url)
      try {
        await navigator.clipboard.writeText(url)
        setCopyFeedback(true)
        setTimeout(() => setCopyFeedback(false), 2500)
      } catch {
        // clipboard may be unavailable; user can copy manually
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

  // Solo space: simplified UI (just "you" + educational message + add button)
  if (isSoloSpace) {
    return (
      <div className="flex flex-col gap-3">
        {/* Simplified solo display */}
        <div className="rounded-lg border bg-muted/30 px-3 py-2">
          <p className="text-sm font-medium">Members: You</p>
          <p className="text-xs text-muted-foreground mt-1">
            You're the only member in this space.
          </p>
        </div>

        {/* Educational message */}
        <div className="rounded-lg border border-dashed border-primary/30 bg-primary/5 px-3 py-2.5">
          <p className="text-xs font-medium text-primary mb-1">ℹ️ Did you know?</p>
          <p className="text-xs text-muted-foreground">
            You can add other people in this space, and share your transactions with them.
          </p>
        </div>

        {/* Add member button — opens unified modal */}
        <button
          type="button"
          onClick={() => { setAddMemberTab('name'); setAddMemberOpen(true) }}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3.5 text-sm font-semibold text-primary-foreground shadow-sm transition-opacity hover:opacity-90 active:opacity-80"
        >
          <span className="text-base leading-none">+</span>
          Add member
        </button>

        {/* Unified Add Member modal — portal to escape overflow:hidden */}
        {addMemberOpen && createPortal(
          <AddMemberModal
            tab={addMemberTab}
            onTabChange={setAddMemberTab}
            onClose={() => setAddMemberOpen(false)}
            onAddUnclaimed={handleAddUnclaimed}
            friends={friends}
            friendsLoading={friendsLoading}
            invitableFriends={invitableFriends}
            invitedUids={invitedUids}
            onInviteFriend={handleSendSpaceInvite}
            usernameQuery={usernameQuery}
            onUsernameQueryChange={setUsernameQuery}
            usernameResults={usernameResults}
            usernameSearching={usernameSearching}
            invitedByUsername={invitedByUsername}
            onInviteByUsername={handleSendSpaceInviteByUsername}
            existingMemberUids={existingMemberUids}
            shareLoading={shareLoading}
            generatedInviteUrl={generatedInviteUrl}
            copyFeedback={copyFeedback}
            onShareLink={handleShareLink}
            onCopyInviteUrl={handleCopyInviteUrl}
          />,
          document.body
        )}
      </div>
    )
  }

  // Multi-member space: full UI
  return (
    <div className="flex flex-col gap-3">

      {/* "No slot" nudge — shown when user has space access but no claimed slot */}
      {hasNoSlot && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
          You haven&apos;t claimed a slot yet — pick who you are below.
        </div>
      )}

      {/* Member list */}
      <ul className="flex flex-col gap-1.5">
        {space.members.map((member) => {
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
                    <p className="text-sm font-medium truncate">{getMemberDisplayLabel(member)}</p>
                  )}

                  {/* Sub-label: "You", "Linked account", or "Unclaimed" */}
                  <p className="text-xs text-muted-foreground">
                    {isMine ? 'You' : isUnclaimed ? 'Unclaimed' : 'Linked account'}
                    {member.userId === space.createdBy && (
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
                  {/* "This is me" button — only on unclaimed slots */}
                  {isUnclaimed && (
                    <button
                      type="button"
                      onClick={() => handleClaim(member)}
                      className="rounded-md border border-primary px-2 py-0.5 text-xs font-medium text-primary transition-colors hover:bg-primary/10"
                    >
                      🎯 This is me
                    </button>
                  )}

                  {/* "This is not me" button — only shown to the user themselves */}
                  {isMine && !isUnclaimed && (
                    <button
                      type="button"
                      onClick={() => handleThisIsNotMe(member)}
                      className="rounded-md border border-muted-foreground/40 px-2 py-0.5 text-xs text-muted-foreground transition-colors hover:border-destructive hover:text-destructive"
                    >
                      ❌ This is not me
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

      {/* Add member button — opens unified 4-tab modal */}
      <button
        type="button"
        onClick={() => { setAddMemberTab('name'); setAddMemberOpen(true) }}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3.5 text-sm font-semibold text-primary-foreground shadow-sm transition-opacity hover:opacity-90 active:opacity-80"
      >
        <span className="text-base leading-none">+</span>
        Add member
      </button>

      {/* Merge members — only shown when 2+ members exist */}
      {space.members.length >= 2 && (
        <button
          type="button"
          onClick={openMergeModal}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors text-center w-full py-1"
        >
          Merge duplicate members
        </button>
      )}

      {/* Unified Add Member modal — portal to escape parent overflow:hidden */}
      {addMemberOpen && createPortal(
        <AddMemberModal
          tab={addMemberTab}
          onTabChange={setAddMemberTab}
          onClose={() => setAddMemberOpen(false)}
          onAddUnclaimed={handleAddUnclaimed}
          friends={friends}
          friendsLoading={friendsLoading}
          invitableFriends={invitableFriends}
          invitedUids={invitedUids}
          onInviteFriend={handleSendSpaceInvite}
          usernameQuery={usernameQuery}
          onUsernameQueryChange={setUsernameQuery}
          usernameResults={usernameResults}
          usernameSearching={usernameSearching}
          invitedByUsername={invitedByUsername}
          onInviteByUsername={handleSendSpaceInviteByUsername}
          existingMemberUids={existingMemberUids}
          shareLoading={shareLoading}
          generatedInviteUrl={generatedInviteUrl}
          copyFeedback={copyFeedback}
          onShareLink={handleShareLink}
          onCopyInviteUrl={handleCopyInviteUrl}
        />,
        document.body
      )}

      {/* Merge members modal — portal to escape parent overflow:hidden */}
      {mergeModalOpen && createPortal(
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => !mergeLoading && setMergeModalOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-lg bg-background border shadow-lg flex flex-col"
            style={{ maxHeight: '85vh' }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b px-4 py-3">
              <h2 className="font-semibold">
                {mergeDone ? '✅ Members merged' : mergeStep === 'select' ? 'Merge duplicate members' : 'Confirm merge'}
              </h2>
              <button
                type="button"
                onClick={() => setMergeModalOpen(false)}
                disabled={mergeLoading}
                className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground hover:bg-muted disabled:opacity-50"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-4">

              {/* ── Done state ── */}
              {mergeDone && (
                <div className="flex flex-col gap-3 text-center">
                  <p className="text-sm">
                    <span className="font-medium">"{mergeDone.deletedName}"</span> deleted.
                    All transactions updated.
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Expenses are now under <span className="font-medium">"{mergeDone.keptName}"</span>.
                  </p>
                  <button
                    type="button"
                    onClick={() => setMergeModalOpen(false)}
                    className="mt-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
                  >
                    Done
                  </button>
                </div>
              )}

              {/* ── Step 1: select two members ── */}
              {!mergeDone && mergeStep === 'select' && (
                <div className="flex flex-col gap-3">
                  <p className="text-xs text-muted-foreground">
                    Select two member slots that represent the same person. Their expenses will be combined.
                  </p>
                  <div className="flex flex-col gap-2">
                    {space.members.map((member) => {
                      const isSelected = mergeSelected.has(member.travelMemberId)
                      const isDisabled = !isSelected && mergeSelected.size >= 2
                      return (
                        <button
                          key={member.travelMemberId}
                          type="button"
                          onClick={() => toggleMergeSelect(member.travelMemberId)}
                          disabled={isDisabled}
                          className={`flex items-center gap-3 rounded-lg border px-3 py-2 text-left transition-colors disabled:opacity-40 ${
                            isSelected ? 'border-primary bg-primary/5' : 'hover:bg-accent'
                          }`}
                        >
                          {/* Checkbox indicator */}
                          <div className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border text-xs ${
                            isSelected ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground'
                          }`}>
                            {isSelected && '✓'}
                          </div>
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground">
                            {(member.displayName || '?').charAt(0).toUpperCase()}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{member.displayName}</p>
                            <p className="text-xs text-muted-foreground">
                              {member.userId === null ? 'Unclaimed' : member.userId === currentUser?.uid ? 'You' : 'Linked account'}
                            </p>
                          </div>
                        </button>
                      )
                    })}
                  </div>
                  <button
                    type="button"
                    onClick={proceedToConfirm}
                    disabled={mergeSelected.size !== 2}
                    className="mt-1 w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Continue
                  </button>
                </div>
              )}

              {/* ── Step 2: choose which to keep + confirm ── */}
              {!mergeDone && mergeStep === 'confirm' && (() => {
                const [a, b] = Array.from(mergeSelected)
                const memberA = space.members.find(m => m.travelMemberId === a)!
                const memberB = space.members.find(m => m.travelMemberId === b)!
                const deleteId = mergeKeepId === a ? b : a
                const deletedMember = space.members.find(m => m.travelMemberId === deleteId)!
                return (
                  <div className="flex flex-col gap-4">
                    <p className="text-xs text-muted-foreground">
                      Choose which member slot to keep. The other will be deleted and all their expenses will move to the kept slot.
                    </p>

                    {/* Keep/delete radio choice */}
                    <div className="flex flex-col gap-2">
                      {[memberA, memberB].map((member) => {
                        const isKeep = mergeKeepId === member.travelMemberId
                        return (
                          <button
                            key={member.travelMemberId}
                            type="button"
                            onClick={() => setMergeKeepId(member.travelMemberId)}
                            className={`flex items-center gap-3 rounded-lg border px-3 py-2 text-left transition-colors ${
                              isKeep ? 'border-primary bg-primary/5' : 'hover:bg-accent'
                            }`}
                          >
                            <div className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border text-xs ${
                              isKeep ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground'
                            }`}>
                              {isKeep && '●'}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium">{member.displayName}</p>
                              <p className="text-xs text-muted-foreground">
                                {member.userId === null ? 'Unclaimed' : member.userId === currentUser?.uid ? 'You' : 'Linked account'}
                                {isKeep && <span className="ml-1 font-medium text-primary">← Keep</span>}
                                {!isKeep && <span className="ml-1 text-destructive">← Delete</span>}
                              </p>
                            </div>
                          </button>
                        )
                      })}
                    </div>

                    {/* Warning */}
                    <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
                      <p className="font-medium">⚠️ This cannot be undone.</p>
                      <p className="mt-0.5">
                        "{deletedMember.displayName}" will be permanently deleted. All their transactions will move to "{space.members.find(m => m.travelMemberId === mergeKeepId)?.displayName}".
                      </p>
                    </div>

                    {/* Action buttons */}
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setMergeStep('select')}
                        disabled={mergeLoading}
                        className="flex-1 rounded-md border px-4 py-2 text-sm transition-colors hover:bg-muted disabled:opacity-50"
                      >
                        Back
                      </button>
                      <button
                        type="button"
                        onClick={handleMerge}
                        disabled={mergeLoading}
                        className="flex-1 rounded-md bg-destructive px-4 py-2 text-sm font-medium text-destructive-foreground disabled:opacity-50"
                      >
                        {mergeLoading ? 'Merging…' : 'Merge & delete'}
                      </button>
                    </div>
                  </div>
                )
              })()}

            </div>
          </div>
        </div>,
        document.body
      )}

      {/* "This is not me" modal — rendered via Portal to escape parent overflow:hidden */}
      {unlinkingMemberId !== null && createPortal(
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => !unlinkLoading && setUnlinkingMemberId(null)}
        >
          <div
            className="w-full max-w-md rounded-lg bg-background border shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="border-b px-4 py-3">
              <h2 className="font-semibold">Who are you in this trip?</h2>
              <p className="text-xs text-muted-foreground mt-1">
                Choose a member to continue. You can pick yourself or a new person.
              </p>
            </div>

            <div className="max-h-96 overflow-y-auto px-4 py-3 flex flex-col gap-2">
              {/* List all members (claimed + unclaimed) — user can claim any of them */}
              {space.members.map((member) => {
                const isCurrent = member.travelMemberId === myMember?.travelMemberId
                return (
                  <button
                    key={member.travelMemberId}
                    type="button"
                    onClick={() => handleUnlinkAndClaim(member.travelMemberId)}
                    disabled={unlinkLoading}
                    className="flex items-center gap-3 rounded-lg border px-3 py-2 text-left transition-colors hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground">
                      {(member.displayName || '?').charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-medium">{member.displayName}</span>
                      {isCurrent && <span className="text-xs text-muted-foreground ml-1">(currently you)</span>}
                    </div>
                    {unlinkLoading ? (
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                    ) : (
                      <span className="text-xs text-primary font-medium">This is me</span>
                    )}
                  </button>
                )
              })}

              {/* Create new member option */}
              <div className="border-t pt-2 mt-2">
                {!unlinkNewMemberName ? (
                  <button
                    type="button"
                    onClick={() => unlinkNewMemberInputRef.current?.focus()}
                    disabled={unlinkLoading}
                    className="w-full rounded-lg border border-dashed px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent/20 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    + Create new member
                  </button>
                ) : (
                  <div className="flex items-center gap-2">
                    <input
                      ref={unlinkNewMemberInputRef}
                      type="text"
                      value={unlinkNewMemberName}
                      onChange={(e) => setUnlinkNewMemberName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !unlinkLoading) handleUnlinkAndCreateNew()
                        if (e.key === 'Escape') setUnlinkNewMemberName('')
                      }}
                      disabled={unlinkLoading}
                      placeholder="Name…"
                      className="min-w-0 flex-1 rounded-md border bg-background px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
                      autoFocus
                    />
                    <button
                      type="button"
                      onClick={handleUnlinkAndCreateNew}
                      disabled={!unlinkNewMemberName.trim() || unlinkLoading}
                      className="shrink-0 rounded-md bg-primary px-3 py-1 text-xs font-medium text-primary-foreground disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {unlinkLoading ? '...' : 'Add'}
                    </button>
                  </div>
                )}
              </div>
            </div>

            <div className="border-t px-4 py-3 flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => setUnlinkingMemberId(null)}
                disabled={unlinkLoading}
                className="rounded-md border px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

interface ParametersTabProps {
  space: Space
  transactions: TransactionWithStatus[]
  onSpaceChange: (updated: Partial<Space>) => void
}

export function ParametersTab({ space, transactions, onSpaceChange }: ParametersTabProps) {
  const navigate = useNavigate()
  const { currentUser } = useAuthStore()
  const [name, setName] = useState(space.name)
  const [emoji, setEmoji] = useState(space.emoji ?? '')

  useEffect(() => { setName(space.name) }, [space.name])
  useEffect(() => { setEmoji(space.emoji ?? '') }, [space.emoji])

  async function handleNameBlur() {
    const trimmed = name.trim()
    if (!trimmed || trimmed === space.name) return
    await updateSpaceMeta(space.spaceId, { name: trimmed })
    onSpaceChange({ name: trimmed })
  }

  async function handleEmojiBlur() {
    const trimmed = emoji.trim()
    if (trimmed === (space.emoji ?? '')) return
    await updateSpaceMeta(space.spaceId, { emoji: trimmed || undefined })
    onSpaceChange({ emoji: trimmed || undefined })
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

  const effectiveCities = mergeCitiesFromTransactions(space.cities ?? [])

  function handleListChange(field: keyof Pick<Space, 'categories' | 'paymentMethods' | 'countries' | 'cities'>) {
    return (items: LabeledItem[]) => onSpaceChange({ [field]: items })
  }

  async function handleCurrenciesChange(codes: string[]) {
    await updateSpaceCurrencies(space.spaceId, codes)
    onSpaceChange({ currencies: codes })
  }

  // ---------------------------------------------------------------------------
  // Fields / config (Phase 3) — read every gate through getSpaceConfig(), never
  // space.config directly, so legacy spaces (no config) resolve to travel-mode
  // defaults and every section stays visible exactly as before this refactor.
  // ---------------------------------------------------------------------------

  const spaceConfig = getSpaceConfig(space)
  const spaceMainCurrency = getSpaceMainCurrency(space)
  const foreignCurrencyTxCount = transactions.filter((tx) => tx.currency !== spaceMainCurrency).length

  // Toggles write immediately; free-text edits inside customFields (a field's label,
  // an option's label) are debounced ~500ms so typing doesn't fire one Firestore
  // write per keystroke. A ref timer is used (not state) so the cleanup effect
  // below can clear it on unmount without depending on render — otherwise a
  // component unmounted mid-typing would fire a write against a stale closure.
  const configWriteTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    return () => { if (configWriteTimer.current) clearTimeout(configWriteTimer.current) }
  }, [])

  // Optimistic local update first (consistent with the rest of this tab). The
  // Firestore write is immediate for builtInFields/features toggles, and
  // debounced when only customFields changed (covers label/option typing).
  // FieldsEditor already normalises `next` before calling this.
  function handleConfigChange(next: SpaceConfig) {
    onSpaceChange({ config: next })

    const togglesChanged =
      JSON.stringify(next.builtInFields) !== JSON.stringify(spaceConfig.builtInFields) ||
      JSON.stringify(next.features) !== JSON.stringify(spaceConfig.features)

    if (configWriteTimer.current) clearTimeout(configWriteTimer.current)

    if (togglesChanged) {
      updateSpaceConfig(space.spaceId, next).catch(console.error)
    } else {
      configWriteTimer.current = setTimeout(() => {
        updateSpaceConfig(space.spaceId, next).catch(console.error)
      }, 500)
    }
  }

  // ---------------------------------------------------------------------------
  // Archive / Leave / Delete logic
  // ---------------------------------------------------------------------------

  const uid = currentUser?.uid ?? ''
  const isArchived = (space.archivedByUids ?? []).includes(uid)

  // Solo check based on memberUids (access-control array).
  // A user in memberUids may not have claimed a slot yet, but they still count
  // as a real user with access to the space.
  // For leave/delete decisions only — use isOnlyClaimedUser, not isSoloSpace (see MembersSection).
  const isOnlyClaimedUser = space.memberUids.length <= 1

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
        await unarchiveSpace(space.spaceId, uid)
        onSpaceChange({ archivedByUids: (space.archivedByUids ?? []).filter((u) => u !== uid) })
      } else {
        await archiveSpace(space.spaceId, uid)
        onSpaceChange({ archivedByUids: [...(space.archivedByUids ?? []), uid] })
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
      if (isOnlyClaimedUser) {
        // Solo or last user — hard-delete the entire space + transactions
        await deleteSpace(space.spaceId)
      } else {
        // Multi-user — leave: remove self from memberUids, unclaim slot
        await leaveSpace(space.spaceId, uid, space.members, space.memberUids, space.createdBy)
      }
      // Navigate back to spaces list after leaving/deleting
      navigate('/spaces')
    } catch (err) {
      console.error('[ParametersTab] leave/delete failed:', err)
      setActionInProgress(false)
    }
  }

  return (
    <div className="flex flex-col gap-6 pb-8">

      {/* Space identity */}
      <Section title="Space">
        <div className="flex gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-muted-foreground">Emoji</label>
            <EmojiInput value={emoji} onChange={setEmoji} onBlur={handleEmojiBlur} ariaLabel="Space emoji" />
            <span className="text-[10px] text-muted-foreground">Tap 🌐</span>
          </div>
          <div className="flex flex-1 flex-col gap-1">
            <label className="text-xs font-medium text-muted-foreground">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={handleNameBlur}
              placeholder="Space name"
              className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
        </div>
      </Section>

      {/* Members — MembersSection receives onSpaceChange so it can update members array */}
      <Section title="Members">
        <MembersSection space={space} onSpaceChange={onSpaceChange} />
      </Section>

      {/* Fields — built-in toggles, feature toggles, custom field editor. Hiding a
          section below never deletes its stored list; re-enabling the field
          brings the section back with its contents intact. */}
      <Section title="Fields">
        <FieldsEditor
          config={spaceConfig}
          onConfigChange={handleConfigChange}
          presetOrigin={space.presetOrigin}
          showPresetSection
          canDisableMultiCurrency={foreignCurrencyTxCount === 0}
          foreignCurrencyTxCount={foreignCurrencyTxCount}
        />
      </Section>

      {/* Currencies — collapsed to a single discreet trigger when multiCurrency is
          off (SPEC §6.2, second trigger). Picking a second currency here flips the
          sticky flag on and reveals the full section, same as the form's inline
          control. */}
      {!spaceConfig.features.multiCurrency && (
        <Section title="Currencies">
          <div className="flex items-center justify-between rounded-lg border bg-muted/30 px-3 py-2">
            <div>
              <p className="text-sm font-medium">Main currency</p>
              <p className="text-xs text-muted-foreground">{spaceMainCurrency}</p>
            </div>
            <InlineCurrencyControl
              mainCurrency={spaceMainCurrency}
              onChange={(code) => {
                if (code === spaceMainCurrency) return
                handleConfigChange({ ...spaceConfig, features: { ...spaceConfig.features, multiCurrency: true } })
                if (!(space.currencies ?? []).includes(code)) {
                  handleCurrenciesChange([...(space.currencies ?? []), code]).catch(console.error)
                }
              }}
            />
          </div>
        </Section>
      )}

      {spaceConfig.features.multiCurrency && (
        <Section title="Currencies">
          {/* Read-only main currency display — locked after creation (editable + recompute is v2). */}
          {(() => {
            const mc = getSpaceMainCurrency(space)
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
            selected={space.currencies ?? []}
            onChange={handleCurrenciesChange}
            lockedCurrency={getSpaceMainCurrency(space)}
          />
        </Section>
      )}

      {/* Exchange Rates — editable default rates for each currency vs mainCurrency.
          Hidden when multiCurrency is off. */}
      {spaceConfig.features.multiCurrency && (() => {
        const mc = getSpaceMainCurrency(space)
        // Show all currencies in the space's list except the main currency.
        const currenciesWithRates = (space.currencies ?? []).filter((c) => c !== mc)

        if (currenciesWithRates.length === 0) return null

        return (
          <Section title="Exchange rates">
            <p className="text-xs text-muted-foreground">
              Default rates for new transactions. Editing a rate only affects future transactions.
            </p>
            {currenciesWithRates.map((code) => {
              // Read from space.defaultRates, fall back to hardcoded cross-rate
              const storedRate = space.defaultRates?.[code]
              const rate = storedRate ?? getExchangeRate(code, mc)
              return (
                <ExchangeRateRow
                  key={code}
                  code={code}
                  mainCurrency={mc}
                  rate={rate}
                  spaceId={space.spaceId}
                  onRateChange={(c, newRate) => {
                    // Optimistic local update so other components see the change immediately
                    onSpaceChange({
                      defaultRates: { ...(space.defaultRates ?? {}), [c]: newRate },
                    })
                  }}
                />
              )
            })}
          </Section>
        )
      })()}

      {/* Categories — hidden when builtInFields.category is off */}
      {spaceConfig.builtInFields.category && (
        <Section title="Categories">
          <EditableLabeledList
            items={space.categories ?? []}
            spaceId={space.spaceId}
            field="categories"
            placeholder="Category name…"
            onItemsChange={handleListChange('categories')}
          />
        </Section>
      )}

      {/* Payment methods — hidden when builtInFields.paymentMethod is off */}
      {spaceConfig.builtInFields.paymentMethod && (
        <Section title="Payment methods">
          <EditableLabeledList
            items={space.paymentMethods ?? []}
            spaceId={space.spaceId}
            field="paymentMethods"
            placeholder="Payment method…"
            onItemsChange={handleListChange('paymentMethods')}
          />
        </Section>
      )}

      {/* Countries — hidden when builtInFields.country is off */}
      {spaceConfig.builtInFields.country && (
        <Section title="Countries">
          <CountryPicker
            selected={space.countries ?? []}
            spaceId={space.spaceId}
            onSelectedChange={handleListChange('countries')}
          />
        </Section>
      )}

      {/* Cities — hidden when builtInFields.city is off. Still auto-seeded from transactions. */}
      {spaceConfig.builtInFields.city && (
        <Section title="Cities">
          <EditableLabeledList
            items={effectiveCities}
            spaceId={space.spaceId}
            field="cities"
            placeholder="City name…"
            onItemsChange={handleListChange('cities')}
            hideEmoji
          />
        </Section>
      )}

      {/* Feedback — embedded form for quick beta feedback */}
      <Section title="Feedback">
        <FeedbackForm source="ParametersTab" />
      </Section>

      {/* ----------------------------------------------------------------- */}
      {/* Manage space — archive and leave/delete actions                   */}
      {/* ----------------------------------------------------------------- */}
      <Section title="Manage space">
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
                : (isArchived ? 'Unarchive this space' : 'Archive this space')}
          </Button>
          {/* Explanation label — different wording for solo vs multi-user spaces */}
          {!isArchived && !archiveDone && (
            <p className="text-xs text-muted-foreground">
              {isOnlyClaimedUser
                ? 'Move this space to an archive directory. You will still be able to open it and add or edit transactions.'
                : 'Move this space to an archive directory. You will remain a member of this space, and still be able to open it and add or edit transactions. This will have no impact on other participants.'}
            </p>
          )}

          {/* Visual confirmation banner after archiving */}
          {archiveDone && (
            <div className={`rounded-lg px-3 py-2 text-sm font-medium ${
              isArchived
                ? 'bg-amber-50 text-amber-800 border border-amber-200 dark:bg-amber-950 dark:text-amber-200 dark:border-amber-800'
                : 'bg-green-50 text-green-800 border border-green-200 dark:bg-green-950 dark:text-green-200 dark:border-green-800'
            }`}>
              {isArchived
                ? 'This space is now archived. It will appear in your "Archived" section.'
                : 'This space has been unarchived and is back in your active list.'}
            </div>
          )}

          {/* Leave / Delete — opens confirmation dialog */}
          <Button
            type="button"
            variant="destructive"
            className="w-full justify-start"
            onClick={() => setConfirmOpen(true)}
          >
            {isOnlyClaimedUser ? 'Delete this space' : 'Leave this space'}
          </Button>
        </div>

        {/* Explanation text */}
        <p className="text-xs text-muted-foreground">
          {isOnlyClaimedUser
            ? 'You are the only user. Deleting will permanently remove this space and all its transactions.'
            : 'Leaving will remove you from the space. Other members will still have access. Your past transactions will be preserved.'}
        </p>
      </Section>

      {/* Confirmation dialog for leave/delete */}
      <AlertDialog open={confirmOpen} onOpenChange={(open) => { if (!open) setConfirmOpen(false) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {isOnlyClaimedUser ? 'Delete this space?' : 'Leave this space?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {isOnlyClaimedUser
                ? 'This will permanently delete the space and all its transactions. This action cannot be undone.'
                : 'You will lose access to this space. Your expense history will be preserved for other members.'}
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
                ? (isOnlyClaimedUser ? 'Deleting…' : 'Leaving…')
                : (isOnlyClaimedUser ? 'Delete' : 'Leave')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </div>
  )
}
