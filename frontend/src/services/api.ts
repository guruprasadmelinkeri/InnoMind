import axios, { AxiosError } from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api';

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 10000,
});

export interface ApiErrorResponse {
  message: string;
  statusCode?: number;
  isConflict?: boolean;
}

export const parseApiError = (error: unknown): ApiErrorResponse => {
  if (axios.isAxiosError(error)) {
    const axiosError = error as AxiosError<{ detail?: string }>;
    const status = axiosError.response?.status;
    const detail = axiosError.response?.data?.detail;

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
    message: (error as Error)?.message || 'An unknown error occurred.',
  };
};
