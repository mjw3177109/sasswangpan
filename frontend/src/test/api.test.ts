import { afterEach, describe, expect, it, vi } from 'vitest'
import { apiRequest } from '../services/api'

describe('apiRequest', () => {
  afterEach(() => vi.restoreAllMocks())

  it('returns the standard success envelope and includes credentials', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ data: { ok: true }, meta: { request_id: 'r1' } }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    const response = await apiRequest<{ ok: boolean }>('/demo')
    expect(response.data.ok).toBe(true)
    expect(fetchMock).toHaveBeenCalledWith('/api/demo', expect.objectContaining({ credentials: 'include' }))
  })

  it('throws ApiError for the standard error envelope', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ error: { code: 'VERSION_CONFLICT', message: '冲突' }, meta: { request_id: 'r2' } }), { status: 409, headers: { 'Content-Type': 'application/json' } }))
    await expect(apiRequest('/demo')).rejects.toMatchObject({ status: 409, code: 'VERSION_CONFLICT', requestId: 'r2' })
  })
})