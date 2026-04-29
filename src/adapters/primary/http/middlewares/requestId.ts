import { createMiddleware } from 'hono/factory';

export function requestIdMiddleware() {
	return createMiddleware(async (c, next) => {
		const requestId = crypto.randomUUID();
		c.set('requestId', requestId);
		await next();
	});
}
