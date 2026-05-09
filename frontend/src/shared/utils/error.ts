// ═══════════════════════════════════════════════════════
// Error handling utilities
// ═══════════════════════════════════════════════════════

/**
 * Application error with user-facing message
 */
export class AppError extends Error {
  constructor(
    message: string,
    public code: string,
    public userMessage: string
  ) {
    super(message);
    this.name = 'AppError';
  }
}

/**
 * Error codes for different error types
 */
export const ErrorCode = {
  // Session errors
  SESSION_CREATE_FAILED: 'SESSION_CREATE_FAILED',
  SESSION_LOAD_FAILED: 'SESSION_LOAD_FAILED',
  SESSION_DELETE_FAILED: 'SESSION_DELETE_FAILED',
  SESSION_NOT_FOUND: 'SESSION_NOT_FOUND',

  // API errors
  API_REQUEST_FAILED: 'API_REQUEST_FAILED',
  API_NETWORK_ERROR: 'API_NETWORK_ERROR',
  API_TIMEOUT: 'API_TIMEOUT',

  // Storage errors
  STORAGE_READ_FAILED: 'STORAGE_READ_FAILED',
  STORAGE_WRITE_FAILED: 'STORAGE_WRITE_FAILED',

  // Runtime errors
  RUNTIME_ERROR: 'RUNTIME_ERROR',
  STREAM_ERROR: 'STREAM_ERROR',

  // Validation errors
  INVALID_INPUT: 'INVALID_INPUT',
  INVALID_CONFIG: 'INVALID_CONFIG',
} as const;

/**
 * Handle errors with user-friendly messages
 */
export function handleError(error: unknown, context?: string): void {
  if (error instanceof AppError) {
    console.error(`[${error.code}]${context ? ` ${context}:` : ''} ${error.message}`);
    showToast(error.userMessage);
  } else if (error instanceof Error) {
    console.error(`${context ? `${context}: ` : ''}${error.message}`, error);
    showToast('操作失败，请重试');
  } else {
    console.error(`${context ? `${context}: ` : ''}Unknown error`, error);
    showToast('发生未知错误');
  }
}

/**
 * Show toast notification (imported from toast component)
 */
function showToast(message: string): void {
  // Dynamic import to avoid circular dependency
  import('../components/toast').then(({ showToast }) => {
    showToast(message);
  });
}

/**
 * Create session-related errors
 */
export const SessionError = {
  createFailed: (reason?: string) => new AppError(
    `Failed to create session: ${reason || 'unknown'}`,
    ErrorCode.SESSION_CREATE_FAILED,
    '创建会话失败'
  ),

  loadFailed: (sessionId: string, reason?: string) => new AppError(
    `Failed to load session ${sessionId}: ${reason || 'unknown'}`,
    ErrorCode.SESSION_LOAD_FAILED,
    '加载会话失败'
  ),

  deleteFailed: (sessionId: string, reason?: string) => new AppError(
    `Failed to delete session ${sessionId}: ${reason || 'unknown'}`,
    ErrorCode.SESSION_DELETE_FAILED,
    '删除会话失败'
  ),

  notFound: (sessionId: string) => new AppError(
    `Session ${sessionId} not found`,
    ErrorCode.SESSION_NOT_FOUND,
    '会话不存在'
  ),
};

/**
 * Create API-related errors
 */
export const ApiError = {
  requestFailed: (url: string, status: number, statusText: string) => new AppError(
    `API request failed: ${url} (${status} ${statusText})`,
    ErrorCode.API_REQUEST_FAILED,
    `请求失败 (${status})`
  ),

  networkError: (url: string) => new AppError(
    `Network error: ${url}`,
    ErrorCode.API_NETWORK_ERROR,
    '网络连接失败'
  ),

  timeout: (url: string) => new AppError(
    `Request timeout: ${url}`,
    ErrorCode.API_TIMEOUT,
    '请求超时'
  ),
};

/**
 * Create runtime-related errors
 */
export const RuntimeError = {
  streamError: (reason?: string) => new AppError(
    `Stream error: ${reason || 'unknown'}`,
    ErrorCode.STREAM_ERROR,
    'AI 响应流错误'
  ),

  runtimeError: (reason?: string) => new AppError(
    `Runtime error: ${reason || 'unknown'}`,
    ErrorCode.RUNTIME_ERROR,
    'AI 运行时错误'
  ),
};
