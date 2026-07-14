import { proxy } from './_lib/proxy.mjs';

export function GET(request) { return proxy(request); }
export function POST(request) { return proxy(request); }
export function DELETE(request) { return proxy(request); }

