import { apiRequest } from './api'

export interface AttachmentData {
  id: string
  document_id: string | null
  file_name: string
  mime_type: string
  size_bytes: number
  url: string
  created_at: string
}

interface UploadIntent {
  mode: 'direct' | 'proxy'
  upload_url?: string
  upload_headers?: Record<string, string>
  upload_token?: string
}

export function listAttachments(documentId: string) {
  return apiRequest<AttachmentData[]>(`/attachments?document_id=${encodeURIComponent(documentId)}`)
}

export async function uploadAttachment(documentId: string, file: File) {
  const intent = await apiRequest<UploadIntent>('/attachments/presign', {
    method: 'POST',
    body: JSON.stringify({
      document_id: documentId,
      file_name: file.name,
      mime_type: file.type || 'application/octet-stream',
      size_bytes: file.size,
    }),
  })

  if (intent.data.mode === 'proxy') {
    const form = new FormData()
    form.append('document_id', documentId)
    form.append('file', file)
    return apiRequest<AttachmentData>('/attachments', { method: 'POST', body: form })
  }

  if (!intent.data.upload_url || !intent.data.upload_token) {
    throw new Error('对象存储上传凭证不完整')
  }
  const response = await fetch(intent.data.upload_url, {
    method: 'PUT',
    headers: intent.data.upload_headers ?? { 'Content-Type': file.type || 'application/octet-stream' },
    body: file,
  })
  if (!response.ok) throw new Error(`对象存储上传失败 (${response.status})`)

  return apiRequest<AttachmentData>('/attachments/complete', {
    method: 'POST',
    body: JSON.stringify({ upload_token: intent.data.upload_token }),
  })
}

export function deleteAttachment(id: string) {
  return apiRequest<{ deleted: boolean }>(`/attachments/${id}`, { method: 'DELETE' })
}
