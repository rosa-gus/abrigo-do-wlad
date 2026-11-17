import { HTTP_STATUS } from "./constants";

interface ApiResponse<T = unknown> {
  message: string;
  data?: T;
  errors?: unknown;
}

export function sendResponse<T = unknown>(
  statusCode: number,
  message: string,
  data?: T,
  errors?: unknown,
): Response {
  const response: ApiResponse<T> = {
    message,
    ...(data !== undefined ? { data } : {}),
    ...(errors !== undefined ? { errors } : {}),
  };

  return new Response(JSON.stringify(response), {
    status: statusCode,
    headers: {
      "Content-Type": "application/json",
    },
  });
}

export function sendSuccess<T = unknown>(
  message: string,
  data?: T,
  statusCode: number = HTTP_STATUS.OK,
): Response {
  return sendResponse(statusCode, message, data);
}

export function sendError(
  statusCode: number,
  message: string,
  errors?: unknown,
): Response {
  return sendResponse(statusCode, message, undefined, errors);
}
