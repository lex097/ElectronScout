// api/client.ts - Axios instance with TBA API configuration
import axios, { AxiosInstance, AxiosError, InternalAxiosRequestConfig, AxiosResponse } from 'axios';

const TBA_BASE_URL = 'https://www.thebluealliance.com/api/v3';
const TBA_API_KEY = process.env.EXPO_PUBLIC_TBA_API_KEY;

if (!TBA_API_KEY) {
  console.warn('EXPO_PUBLIC_TBA_API_KEY is not set. TBA API calls will fail.');
}

/**
 * Create configured Axios instance for TBA API
 */
const tbaClient: AxiosInstance = axios.create({
  baseURL: TBA_BASE_URL,
  timeout: 10000, // 10 seconds
  headers: {
    'X-TBA-Auth-Key': TBA_API_KEY || '',
  },
});

/**
 * Request interceptor for logging
 */
tbaClient.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    console.log(`[TBA API] ${config.method?.toUpperCase()} ${config.url}`);
    return config;
  },
  (error: AxiosError) => {
    console.error('[TBA API] Request error:', error);
    return Promise.reject(error);
  }
);

/**
 * Response interceptor for logging
 */
tbaClient.interceptors.response.use(
  (response: AxiosResponse) => {
    console.log(`[TBA API] ${response.status} ${response.config.url}`);
    return response;
  },
  (error: AxiosError) => {
    if (error.response) {
      // Server responded with error status
      console.error(
        `[TBA API] Error ${error.response.status}: ${error.response.statusText}`,
        error.response.data
      );
    } else if (error.request) {
      // Request made but no response received
      console.error('[TBA API] No response received:', error.request);
    } else {
      // Error setting up request
      console.error('[TBA API] Request setup error:', error.message);
    }
    return Promise.reject(error);
  }
);

export default tbaClient;

