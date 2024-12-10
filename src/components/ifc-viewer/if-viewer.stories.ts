import type { Meta, StoryObj } from '@storybook/react'
import { IfcViewer, type IfcViewerProps } from './ifc-viewer'

const meta = {
	title: 'Components/IFC Viewer',
	component: IfcViewer,
	parameters: {},
	tags: ['autodocs'],
	argTypes: {},
} satisfies Meta<typeof IfcViewer>

export default meta

type Story = StoryObj<typeof meta>

const defaultProps: IfcViewerProps = {
	url: '/test/castle.ifc',
	enableMeshHover: true,
	enableMeshSelection: true,
	style: { minHeight: '480px' },
	links: [],
	selectable: [{ requiredType: 'IfcDistributionControlElement' }],
	alwaysVisible: [{ requiredType: 'IfcDistributionControlElement' }],
	anchors: [],
}

export const DefaultViewer: Story = {
	args: {
		...defaultProps,
	},
}
