import axios, { AxiosError } from 'axios';

const apiProtocol = window.location.protocol === 'https:' ? 'https:' : 'http:';
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || `${apiProtocol}//${window.location.hostname}:8000/api`;

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 30000,
});

apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('mediroute_access_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export interface ApiErrorResponse {
  message: string;
  statusCode?: number;
  isConflict?: boolean;
}

const formatApiDetail = (detail: unknown): string | undefined => {
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) {
    const messages = detail.map((issue) => {
      if (typeof issue === 'string') return issue;
      if (!issue || typeof issue !== 'object') return undefined;
      const item = issue as { msg?: unknown; loc?: unknown };
      const message = typeof item.msg === 'string' ? item.msg : undefined;
      if (!message) return undefined;
      const location = Array.isArray(item.loc)
        ? item.loc.filter((part) => typeof part === 'string' && part !== 'body').join(' → ')
        : '';
      return location ? `${location}: ${message}` : message;
    }).filter((message): message is string => Boolean(message));
    return messages.length ? messages.join('\n') : 'The request could not be validated. Please check the entered information.';
  }
  if (detail && typeof detail === 'object') {
    const value = detail as { msg?: unknown; message?: unknown };
    if (typeof value.message === 'string') return value.message;
    if (typeof value.msg === 'string') return value.msg;
  }
  return undefined;
};

export const parseApiError = (error: unknown): ApiErrorResponse => {
  if (axios.isAxiosError(error)) {
    const axiosError = error as AxiosError<{ detail?: unknown }>;
    const status = axiosError.response?.status;
    const detail = formatApiDetail(axiosError.response?.data?.detail);

    if (status === 409) {
      return {
        message: detail || 'Resource Conflict: The requested resource is no longer available.',
        statusCode: 409,
        isConflict: true,
      };
    }

    if (status === 400) {
      return {
        message: detail || 'Invalid request parameters.',
        statusCode: 400,
      };
    }

    if (status === 404) {
      return {
        message: detail || 'The requested resource could not be found.',
        statusCode: 404,
      };
    }

    if (status === 422) {
      return {
        message: detail || 'Validation error: Please check your input fields.',
        statusCode: 422,
      };
    }

    if (status && status >= 500) {
      return {
        message: 'Server error: Please try again shortly.',
        statusCode: status,
      };
    }

    if (axiosError.code === 'ECONNABORTED' || !axiosError.response) {
      return {
        message: 'Network connection failed. Please ensure the backend server is running.',
      };
    }

    return {
      message: detail || axiosError.message || 'An unexpected error occurred.',
      statusCode: status,
    };
  }

  return {
    message: error instanceof Error ? error.message : 'An unknown error occurred.',
  };
};
