import { useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Download, FileArchive, FileImage, FileText, FileVideo, FolderUp, HardDrive, Info,
  Loader2, Package, Plus, ShieldCheck, Smartphone, Trash2, UploadCloud, X,
} from 'lucide-react'
import type { Device, DeviceFile, UsageSummary } from '@shared/contracts'
import { get, post, uploadFile } from '../lib/api'
import { useAuth } from '../lib/auth'
import { useToast } from '../lib/toast'
import { Badge, Button, Card, EmptyState, Modal, PageHeader, Progress, Select } from '../components/ui'
import { cn, formatBytes, formatGbFromMb, relativeTime } from '../lib/utils'

const kindMeta: Record<DeviceFile['kind'], { icon: React.ComponentType<{ className?: string }>; tone: string; label: string }> = {
  apk: { icon: Package, tone: 'border-emerald-400/20 bg-emerald-400/10 text-emerald-300', label: 'APK' },
  image: { icon: FileImage, tone: 'border-iris-400/20 bg-iris-400/10 text-iris-300', label: 'Image' },
  video: { icon: FileVideo, tone: 'border-fuchsia-400/20 bg-fuchsia-400/10 text-fuchsia-300', label: 'Video' },
  document: { icon: FileText, tone: 'border-electric-400/20 bg-electric-400/10 text-electric-300', label: 'Document' },
  archive: { icon: FileArchive, tone: 'border-amber-400/20 bg-amber-400/10 text-amber-300', label: 'Archive' },
  other: { icon: FileText, tone: 'border-white/10 bg-white/[0.04] text-zinc-400', label: 'File' },
}

interface Uploading {
  name: string
  size: number
  progress: number
  error?: string
}

export default function FilesPage() {
  const { plan } = useAuth()
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const inputRef = useRef<HTMLInputElement>(null)
  const [deviceId, setDeviceId] = useState<string>('')
  const [dragging, setDragging] = useState(false)
  const [uploads, setUploads] = useState<Uploading[]>([])
  const [deleteTarget, setDeleteTarget] = useState<DeviceFile | null>(null)
  const [installing, setInstalling] = useState<string | null>(null)

  const devicesQuery = useQuery<{ devices: Device[] }>({
    queryKey: ['devices'],
    queryFn: () => get('/devices'),
    refetchInterval: 6000,
  })
  const devices = devicesQuery.data?.devices || []
  const effectiveDeviceId = deviceId || devices[0]?.id || ''
  const filesQuery = useQuery<{ files: DeviceFile[]; usedBytes: number }>({
    queryKey: ['files', effectiveDeviceId],
    queryFn: () => get(`/files${effectiveDeviceId ? `?deviceId=${effectiveDeviceId}` : ''}`),
    refetchInterval: 15_000,
  })
  const usageQuery = useQuery<{ usage: UsageSummary }>({
    queryKey: ['usage'],
    queryFn: () => get('/usage'),
  })

  const selectedDevice = devices.find((device) => device.id === effectiveDeviceId)
  const files = filesQuery.data?.files || []
  const usedBytes = usageQuery.data?.usage?.storageMb ? usageQuery.data.usage.storageMb * 1024 * 1024 : filesQuery.data?.usedBytes || 0
  const limitBytes = (usageQuery.data?.usage?.limits?.storageMb || plan?.storageMb || 0) * 1024 * 1024
  const storagePct = limitBytes ? (usedBytes / limitBytes) * 100 : 0

  const runningTargets = useMemo(() => devices.filter((device) => device.status === 'running' && !device.isDemo), [devices])

  async function handleFiles(list: FileList | null) {
    if (!list || !list.length) return
    if (!effectiveDeviceId) {
      toast('Create a phone first', { kind: 'error', description: 'Files must be attached to one of your cloud phones.' })
      return
    }
    const filesArray = Array.from(list)
    setUploads(filesArray.map((file) => ({ name: file.name, size: file.size, progress: 0 })))
    for (let index = 0; index < filesArray.length; index += 1) {
      const file = filesArray[index]
      try {
        const result = await uploadFile(`/api/v1/devices/${effectiveDeviceId}/files`, file, (progress) => {
          setUploads((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, progress } : item))
        })
        toast(`${file.name} uploaded`, { kind: 'success', description: result.message })
      } catch (error: any) {
        setUploads((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, error: error.message } : item))
        toast(`Upload failed: ${file.name}`, { kind: 'error', description: error.message })
      }
    }
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['files'] }),
      queryClient.invalidateQueries({ queryKey: ['usage'] }),
      queryClient.invalidateQueries({ queryKey: ['activity'] }),
    ])
    window.setTimeout(() => setUploads([]), 2200)
    if (inputRef.current) inputRef.current.value = ''
  }

  async function install(file: DeviceFile) {
    setInstalling(file.id)
    try {
      const result = await post<{ message: string }>(`/files/${file.id}/install`)
      toast('APK installed', { kind: 'success', description: result.message })
      await queryClient.invalidateQueries({ queryKey: ['activity'] })
    } catch (error: any) {
      toast('APK install failed', { kind: 'error', description: error?.message })
    } finally {
      setInstalling(null)
    }
  }

  async function remove(file: DeviceFile) {
    try {
      await fetch(`/api/v1/files/${file.id}`, { method: 'DELETE', credentials: 'include' }).then(async (response) => {
        if (!response.ok) {
          const payload = await response.json().catch(() => ({}))
          throw new Error(payload.error || 'Delete failed')
        }
      })
      toast('File deleted', { kind: 'success' })
      setDeleteTarget(null)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['files'] }),
        queryClient.invalidateQueries({ queryKey: ['usage'] }),
      ])
    } catch (error: any) {
      toast('Could not delete file', { kind: 'error', description: error?.message })
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Storage"
        title="File transfer"
        description="Move files between your computer and your cloud phones. APKs install through Android's package manager."
        actions={
          <Button variant="primary" onClick={() => inputRef.current?.click()} disabled={!effectiveDeviceId}>
            <UploadCloud className="h-4 w-4" /> Upload files
          </Button>
        }
      />

      <div className="grid gap-3 lg:grid-cols-[1fr,320px]">
        <div className="space-y-3">
          <Card className="p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2">
                <Smartphone className="h-4 w-4 text-iris-300" />
                <span className="text-xs font-medium text-zinc-300">Target phone</span>
              </div>
              <div className="flex items-center gap-2">
                {runningTargets.length > 0 && (
                  <Badge tone="green">{runningTargets.length} live target{runningTargets.length === 1 ? '' : 's'}</Badge>
                )}
                <Select
                  value={effectiveDeviceId}
                  onChange={(event) => setDeviceId(event.target.value)}
                  className="h-9 w-full text-xs sm:w-64"
                >
                  {devices.length === 0 && <option value="">No phones yet</option>}
                  {devices.map((device) => (
                    <option key={device.id} value={device.id}>
                      {device.name} {device.isDemo ? '· demo' : device.status === 'running' ? '· running' : '· stopped'}
                    </option>
                  ))}
                </Select>
              </div>
            </div>
            {selectedDevice && (
              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-white/[0.06] pt-3 text-[10px] text-zinc-500">
                <span>Android {selectedDevice.androidVersion}</span>
                <span>{selectedDevice.storageGb} GB device storage</span>
                <span className={selectedDevice.status === 'running' && !selectedDevice.isDemo ? 'text-emerald-400' : 'text-amber-400'}>
                  {selectedDevice.isDemo ? 'Demo — no device storage' : selectedDevice.status === 'running' ? 'Ready for transfer' : 'Uploads stored until boot'}
                </span>
                <Link to={`/app/phones/${selectedDevice.id}`} className="ml-auto text-iris-300 hover:text-iris-200">Open workspace</Link>
              </div>
            )}
          </Card>

          <div
            onDragOver={(event) => { event.preventDefault(); setDragging(true) }}
            onDragLeave={() => setDragging(false)}
            onDrop={(event) => { event.preventDefault(); setDragging(false); void handleFiles(event.dataTransfer.files) }}
            onClick={() => effectiveDeviceId && inputRef.current?.click()}
            className={cn(
              'group cursor-pointer rounded-2xl border border-dashed p-8 text-center transition sm:p-10',
              dragging ? 'border-iris-400/60 bg-iris-500/[0.06]' : 'border-white/10 bg-white/[0.015] hover:border-iris-400/30 hover:bg-iris-500/[0.02]',
              !effectiveDeviceId && 'pointer-events-none opacity-50',
            )}
          >
            <input
              ref={inputRef}
              type="file"
              multiple
              className="hidden"
              accept=".apk,.png,.jpg,.jpeg,.gif,.webp,.heic,.bmp,.mp4,.webm,.mov,.mkv,.mp3,.wav,.ogg,.pdf,.txt,.md,.csv,.json,.xml,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip,.tar,.gz,.7z"
              onChange={(event) => void handleFiles(event.target.files)}
              onClick={(event) => event.stopPropagation()}
            />
            <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl border border-white/10 bg-white/[0.03] text-zinc-400 transition group-hover:border-iris-400/30 group-hover:text-iris-300">
              <UploadCloud className="h-5 w-5" />
            </div>
            <p className="mt-4 text-sm font-medium text-white">Drop files here or click to browse</p>
            <p className="mt-1 text-[11px] text-zinc-500">APK, images, video, PDF, documents and archives · up to 200 MB each</p>
            <p className="mt-3 text-[10px] text-zinc-600">
              {selectedDevice ? `Destination: ${selectedDevice.name}` : 'Select a phone to enable uploads'}
            </p>
          </div>

          {uploads.length > 0 && (
            <Card className="p-4">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-xs font-medium text-zinc-300">Uploads</h3>
                <span className="text-[10px] text-zinc-500">{uploads.filter((item) => item.progress >= 100 && !item.error).length}/{uploads.length} done</span>
              </div>
              <div className="space-y-2.5">
                {uploads.map((item, index) => (
                  <div key={`${item.name}-${index}`}>
                    <div className="flex items-center justify-between gap-3 text-[10px]">
                      <span className="truncate text-zinc-300">{item.name}</span>
                      <span className={cn('shrink-0 font-mono', item.error ? 'text-rose-400' : 'text-zinc-500')}>
                        {item.error ? 'Failed' : `${item.progress}%`}
                      </span>
                    </div>
                    <Progress className="mt-1" value={item.error ? 100 : item.progress} height="h-1" tone={item.error ? 'rose' : item.progress >= 100 ? 'green' : 'violet'} />
                    {item.error && <p className="mt-1 text-[9px] text-rose-400">{item.error}</p>}
                  </div>
                ))}
              </div>
            </Card>
          )}

          <Card className="overflow-hidden">
            <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-3">
              <h2 className="font-display text-sm font-semibold text-white">Phone files <span className="ml-1 font-normal text-zinc-600">({files.length})</span></h2>
              <span className="text-[10px] text-zinc-500">{formatGbFromMb(usedBytes / (1024 * 1024))} used</span>
            </div>
            {filesQuery.isLoading ? (
              <div className="flex items-center justify-center py-14"><Loader2 className="h-5 w-5 animate-spin text-iris-400" /></div>
            ) : files.length === 0 ? (
              <EmptyState
                className="border-0 bg-transparent"
                icon={FolderUp}
                title="No files in this view"
                description="Upload an APK to sideload, or send documents, images and media to the phone's Download folder."
                action={effectiveDeviceId ? <Button variant="secondary" onClick={() => inputRef.current?.click()}><Plus className="h-4 w-4" /> Choose files</Button> : undefined}
              />
            ) : (
              <div className="divide-y divide-white/[0.05]">
                {files.map((file) => {
                  const meta = kindMeta[file.kind]
                  const target = devices.find((device) => device.id === file.deviceId)
                  const canInstall = file.kind === 'apk' && target?.status === 'running' && !target?.isDemo
                  return (
                    <div key={file.id} className="flex items-center gap-3 px-4 py-3 transition hover:bg-white/[0.02]">
                      <div className={cn('grid h-9 w-9 shrink-0 place-items-center rounded-lg border', meta.tone)}>
                        <meta.icon className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-medium text-zinc-200">{file.name}</p>
                        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[9px] text-zinc-500">
                          <span>{formatBytes(file.size)}</span>
                          <span className="h-2 w-px bg-white/10" />
                          <span>{meta.label}</span>
                          <span className="h-2 w-px bg-white/10" />
                          <span>{target?.name || 'Unknown phone'}</span>
                          <span className="h-2 w-px bg-white/10" />
                          <span>{relativeTime(file.createdAt)}</span>
                          {file.pushed && <Badge tone="green" className="ml-1">On phone</Badge>}
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        {file.kind === 'apk' && (
                          <Button
                            variant="secondary"
                            size="sm"
                            className="hidden sm:inline-flex"
                            disabled={!canInstall || installing === file.id}
                            loading={installing === file.id}
                            onClick={() => install(file)}
                            title={canInstall ? 'Install via Android package manager' : 'Start the phone to install'}
                          >
                            <Package className="h-3.5 w-3.5" /> Install
                          </Button>
                        )}
                        <a href={`/api/v1/files/${file.id}/download`} className="grid h-8 w-8 place-items-center rounded-lg text-zinc-500 transition hover:bg-white/[0.06] hover:text-zinc-200" title="Download">
                          <Download className="h-3.5 w-3.5" />
                        </a>
                        <button onClick={() => setDeleteTarget(file)} className="grid h-8 w-8 place-items-center rounded-lg text-zinc-600 transition hover:bg-rose-500/10 hover:text-rose-300" title="Delete">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </Card>
        </div>

        <div className="space-y-3">
          <Card className="p-5">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-sm font-semibold text-white">Storage</h3>
              <HardDrive className="h-4 w-4 text-zinc-500" />
            </div>
            <p className="mt-3 font-display text-2xl font-semibold text-white">{formatGbFromMb(usedBytes / (1024 * 1024))}</p>
            <p className="text-[10px] text-zinc-500">of {formatGbFromMb(limitBytes / (1024 * 1024))} allowance</p>
            <Progress className="mt-3" value={storagePct} tone={storagePct > 85 ? 'rose' : 'violet'} />
            <div className="mt-4 space-y-2 border-t border-white/[0.06] pt-3 text-[10px]">
              <div className="flex justify-between"><span className="text-zinc-500">Files</span><span className="text-zinc-300">{files.length}</span></div>
              <div className="flex justify-between"><span className="text-zinc-500">Plan</span><span className="text-zinc-300">{plan?.name}</span></div>
              <div className="flex justify-between"><span className="text-zinc-500">Max per file</span><span className="text-zinc-300">200 MB</span></div>
            </div>
            <Link to="/app/billing"><Button variant="secondary" size="sm" className="mt-4 w-full">Increase storage</Button></Link>
          </Card>

          <Card className="p-5">
            <h3 className="flex items-center gap-2 font-display text-sm font-semibold text-white"><ShieldCheck className="h-4 w-4 text-emerald-400" /> Transfer safety</h3>
            <ul className="mt-3 space-y-2.5 text-[10px] leading-relaxed text-zinc-500">
              <li>Uploads are stored under your account and never exposed to other users.</li>
              <li>Only known document, media, archive and APK extensions are accepted.</li>
              <li>APK installation uses <span className="mono text-zinc-400">pm install</span> after checking the ZIP header.</li>
              <li>Downloads always use attachment disposition and <span className="mono text-zinc-400">nosniff</span> headers.</li>
              <li>Demo phones store files in CloudDroid only; no Android storage exists.</li>
            </ul>
          </Card>

          <div className="rounded-xl border border-iris-400/15 bg-iris-500/[0.05] p-4 text-[10px] leading-relaxed text-zinc-500">
            <p className="flex items-center gap-1.5 font-medium text-iris-200"><Info className="h-3 w-3" /> APK security</p>
            <p className="mt-1.5">Sideloaded APKs bypass Play Protect. Only install packages you trust. CloudDroid does not claim Play certification for AOSP devices.</p>
          </div>
        </div>
      </div>

      <Modal
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        title="Delete this file?"
        description={deleteTarget ? `${deleteTarget.name} will be removed from CloudDroid storage.` : undefined}
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button variant="danger" onClick={() => deleteTarget && remove(deleteTarget)}>Delete file</Button>
          </>
        }
      >
        <p className="text-[11px] leading-relaxed text-zinc-400">A copy already copied to the Android Download folder is not removed from the phone.</p>
      </Modal>
    </div>
  )
}
