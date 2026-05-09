// ═══════════════════════════════════════════════════════
// Error handling unit tests
// ═══════════════════════════════════════════════════════
import { AppError, ErrorCode, SessionError, ApiError, RuntimeError } from '../error';

describe('AppError', () => {
  it('should create error with all properties', () => {
    const error = new AppError('test message', 'TEST_CODE', 'User message');
    expect(error.message).toBe('test message');
    expect(error.code).toBe('TEST_CODE');
    expect(error.userMessage).toBe('User message');
    expect(error.name).toBe('AppError');
  });

  it('should be instanceof Error', () => {
    const error = new AppError('test', 'TEST', 'test');
    expect(error).toBeInstanceOf(Error);
  });
});

describe('ErrorCode', () => {
  it('should have all required error codes', () => {
    expect(ErrorCode.SESSION_CREATE_FAILED).toBeDefined();
    expect(ErrorCode.SESSION_LOAD_FAILED).toBeDefined();
    expect(ErrorCode.SESSION_DELETE_FAILED).toBeDefined();
    expect(ErrorCode.SESSION_NOT_FOUND).toBeDefined();
    expect(ErrorCode.API_REQUEST_FAILED).toBeDefined();
    expect(ErrorCode.API_NETWORK_ERROR).toBeDefined();
    expect(ErrorCode.API_TIMEOUT).toBeDefined();
  });
});

describe('SessionError', () => {
  it('should create createFailed error', () => {
    const error = SessionError.createFailed('network error');
    expect(error).toBeInstanceOf(AppError);
    expect(error.code).toBe(ErrorCode.SESSION_CREATE_FAILED);
    expect(error.message).toContain('network error');
  });

  it('should create createFailed error with default reason', () => {
    const error = SessionError.createFailed();
    expect(error.message).toContain('unknown');
  });

  it('should create loadFailed error', () => {
    const error = SessionError.loadFailed('session-123', 'not found');
    expect(error.code).toBe(ErrorCode.SESSION_LOAD_FAILED);
    expect(error.message).toContain('session-123');
  });

  it('should create deleteFailed error', () => {
    const error = SessionError.deleteFailed('session-456');
    expect(error.code).toBe(ErrorCode.SESSION_DELETE_FAILED);
    expect(error.message).toContain('session-456');
  });

  it('should create notFound error', () => {
    const error = SessionError.notFound('session-789');
    expect(error.code).toBe(ErrorCode.SESSION_NOT_FOUND);
    expect(error.userMessage).toBe('会话不存在');
  });
});

describe('ApiError', () => {
  it('should create requestFailed error', () => {
    const error = ApiError.requestFailed('/api/test', 404, 'Not Found');
    expect(error.code).toBe(ErrorCode.API_REQUEST_FAILED);
    expect(error.message).toContain('/api/test');
    expect(error.message).toContain('404');
  });

  it('should create networkError', () => {
    const error = ApiError.networkError('/api/test');
    expect(error.code).toBe(ErrorCode.API_NETWORK_ERROR);
    expect(error.userMessage).toBe('网络连接失败');
  });

  it('should create timeout error', () => {
    const error = ApiError.timeout('/api/test');
    expect(error.code).toBe(ErrorCode.API_TIMEOUT);
    expect(error.userMessage).toBe('请求超时');
  });
});

describe('RuntimeError', () => {
  it('should create streamError', () => {
    const error = RuntimeError.streamError('connection lost');
    expect(error.code).toBe(ErrorCode.STREAM_ERROR);
    expect(error.message).toContain('connection lost');
  });

  it('should create runtimeError', () => {
    const error = RuntimeError.runtimeError();
    expect(error.code).toBe(ErrorCode.RUNTIME_ERROR);
    expect(error.message).toContain('unknown');
  });
});
