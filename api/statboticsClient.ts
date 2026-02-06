// api/statboticsClient.ts - Axios instance with Statbotics API configuration
import axios, { AxiosInstance, AxiosError, InternalAxiosRequestConfig, AxiosResponse } from 'axios';

const STATBOTICS_BASE_URL = 'https://api.statbotics.io/v3';

/**
 * Create configured Axios instance for Statbotics API
 * Statbotics API is public and doesn't require authentication
 */
const statboticsClient: AxiosInstance = axios.create({
  baseURL: STATBOTICS_BASE_URL,
  timeout: 10000, // 10 seconds
});

/**
 * Request interceptor for logging
 */
statboticsClient.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    console.log(`[Statbotics API] ${config.method?.toUpperCase()} ${config.url}`);
    return config;
  },
  (error: AxiosError) => {
    console.error('[Statbotics API] Request error:', error);
    return Promise.reject(error);
  }
);

/**
 * Response interceptor for logging
 */
statboticsClient.interceptors.response.use(
  (response: AxiosResponse) => {
    console.log(`[Statbotics API] ${response.status} ${response.config.url}`);
    return response;
  },
  (error: AxiosError) => {
    if (error.response) {
      // Server responded with error status
      console.error(
        `[Statbotics API] Error ${error.response.status}: ${error.response.statusText}`,
        error.response.data
      );
    } else if (error.request) {
      // Request made but no response received
      console.error('[Statbotics API] No response received:', error.request);
    } else {
      // Error setting up request
      console.error('[Statbotics API] Request setup error:', error.message);
    }
    return Promise.reject(error);
  }
);

export default statboticsClient;
