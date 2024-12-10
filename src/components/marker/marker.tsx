import clsx from 'clsx'
import { forwardRef, type HTMLAttributes } from 'react'
import './marker.css'

type MarkerProps = HTMLAttributes<HTMLButtonElement> & {
	position: { top: number; left: number }
}

const Marker = forwardRef<HTMLButtonElement, MarkerProps>((props, ref) => {
	const {
		className,
		position: { top, left },
		...rest
	} = props
	return <button className={clsx('marker', 'gray', className)} style={{ top, left }} ref={ref} {...rest} />
})

Marker.displayName = 'Marker'

const GreenMarker = forwardRef<HTMLButtonElement, MarkerProps>((props, ref) => (
	<Marker className={clsx('green')} ref={ref} {...props} />
))

GreenMarker.displayName = 'GreenMarker'

const BlueMarker = forwardRef<HTMLButtonElement, MarkerProps>((props, ref) => (
	<Marker className={clsx('blue')} ref={ref} {...props} />
))

BlueMarker.displayName = 'BlueMarker'

const RedMarker = forwardRef<HTMLButtonElement, MarkerProps>((props, ref) => (
	<Marker className={clsx('red')} ref={ref} {...props} />
))

RedMarker.displayName = 'RedMarker'

const YellowMarker = forwardRef<HTMLButtonElement, MarkerProps>((props, ref) => (
	<Marker className={clsx('yellow')} ref={ref} {...props} />
))

YellowMarker.displayName = 'YellowMarker'

export { BlueMarker, GreenMarker, Marker, RedMarker, YellowMarker, type MarkerProps }
