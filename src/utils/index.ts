/* eslint-disable unicorn/prefer-global-this */
import clsx, { type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

const cc = (...classes: ClassValue[]) => {
	return twMerge(clsx(...classes))
}

const isRunningInBrowser = () => {
	if (typeof window === 'undefined') {
		return false
	}
	if (typeof navigator === 'undefined') {
		return false
	}
	if (navigator.userAgent.includes('jsdom')) {
		return false
	}
	return true
}

export { cc, isRunningInBrowser }
