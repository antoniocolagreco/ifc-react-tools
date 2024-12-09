import type { ReactNode } from 'react'
import type { Vector3 } from 'three'
import type { Position } from './position'

type Anchor = {
	id: number
	position3d: Vector3
	screenPosition: Position
	visible: boolean
	children?: ReactNode
}

export type { Anchor }
