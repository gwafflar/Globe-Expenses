// src/travels/components/tabs/ParametersTab.tsx

import { useEffect, useRef, useState } from 'react'
import { nanoid } from 'nanoid'
import type { LabeledItem, Travel } from '@/travels/types'
import { updateTravelCurrencies, updateTravelList, updateTravelMeta } from '@/travels/services/travelService'
import type { TransactionWithStatus } from '@/transactions/hooks/useTransactions'
import { useAuthStore } from '@/auth/store/useAuthStore'
import {
  fetchFriends,
  sendTravelInvite,
  createShareableInvite,
} from '@/friends/services/friendService'
import type { Friend } from '@/friends/types'
import { Button } from '@/components/ui/button'
import { ALL_CURRENCIES, ALL_COUNTRIES } from '@/shared/data/pickerData'
import { Share2, UserPlus, Check } from 'lucide-react'

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
}: {
  selected: string[]
  onChange: (codes: string[]) => void
}) {
  const [search, setSearch] = useState('')

  const filtered = ALL_CURRENCIES.filter(([code, , name]) => {
    const q = search.toLowerCase()
    return code.toLowerCase().includes(q) || name.toLowerCase().includes(q)
  })

  function toggle(code: string) {
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
            return (
              <button
                key={code}
                type="button"
                onClick={() => toggle(code)}
                className={`flex items-center gap-3 rounded px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent/40 ${checked ? 'bg-accent/20' : ''}`}
              >
                <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border text-[10px] ${checked ? 'border-primary bg-primary text-primary-foreground' : 'border-input'}`}>
                  {checked && '✓'}
                </span>
                <span className="min-w-0">
                  <span className="font-medium">{code}</span>
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
// MiniAvatar — color circle with initial, same hash as ProfilePage
// ---------------------------------------------------------------------------

function avatarHue(uid: string): number {
  let hash = 0
  for (const ch of uid) hash = (hash * 31 + ch.charCodeAt(0)) & 0xffffffff
  return Math.abs(hash) % 360
}

function MiniAvatar({ uid, name }: { uid: string; name: string }) {
  const hue = avatarHue(uid)
  return (
    <div
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
      style={{ backgroundColor: `hsl(${hue}, 55%, 50%)` }}
    >
      {(name || '?').charAt(0).toUpperCase()}
    </div>
  )
}

// ---------------------------------------------------------------------------
// MembersSection — current members + invite friends + share link
// ---------------------------------------------------------------------------

function MembersSection({ travel }: { travel: Travel }) {
  const { userProfile } = useAuthStore()

  // Friend picker: lazy-loaded when "Invite a friend" is expanded
  const [pickerOpen, setPickerOpen] = useState(false)
  const [friends, setFriends] = useState<Friend[]>([])
  const [friendsLoading, setFriendsLoading] = useState(false)
  // Track which UIDs we just sent a travel invite to (for immediate button feedback)
  const [invitedUids, setInvitedUids] = useState<Set<string>>(new Set())

  // Share invite link state
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

      // Copy to clipboard automatically
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

  return (
    <div className="flex flex-col gap-3">
      {/* Current members list */}
      <ul className="flex flex-col gap-1.5">
        {travel.members.map(member => (
          <li key={member.uid} className="flex items-center gap-2 rounded-lg border bg-card px-3 py-2">
            <MiniAvatar uid={member.uid} name={member.displayName} />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{member.displayName}</p>
            </div>
            {member.uid === travel.createdBy && (
              <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
                creator
              </span>
            )}
          </li>
        ))}
      </ul>

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
                  <MiniAvatar uid={friend.uid} name={friend.displayName} />
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

      {/* Members */}
      <Section title="Members">
        <MembersSection travel={travel} />
      </Section>

      {/* Currencies */}
      <Section title="Currencies">
        <CurrencyPicker selected={travel.currencies ?? []} onChange={handleCurrenciesChange} />
      </Section>

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

    </div>
  )
}