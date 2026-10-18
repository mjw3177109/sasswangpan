import { apiRequest } from './api'

export interface TemplateData { id: string; name: string; description: string; content: string }
export type AiAction = 'summary' | 'outline' | 'polish' | 'continue'
export interface AiResult { action: AiAction; result: string; provider: string }

export function listTemplates() { return apiRequest<TemplateData[]>('/templates') }
export function runAiAction(action: AiAction, content: string) { return apiRequest<AiResult>('/ai/action', { method: 'POST', body: JSON.stringify({ action, content }) }) }
