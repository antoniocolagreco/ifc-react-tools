import type IfcItem from '@/classes/ifc-item'
import type IfcModel from '@/classes/ifc-model'
import type {
	ExpressId,
	LinkRequirements,
	Property,
	PropertySet,
	PropertyValue,
	Requirements,
	SelectableRequirements,
} from '@/types/types'
import {
	IFC2X3,
	IFCRELAGGREGATES,
	IFCRELASSIGNS,
	IFCRELDEFINESBYPROPERTIES,
	IFCRELDEFINESBYTYPE,
	type Handle,
	type IfcAPI,
} from 'web-ifc'

/**
 * Sets the type and properties of an IFC item using the provided IFC API.
 *
 * @param ifcAPI - The IFC API instance used to retrieve IFC data.
 * @param modelID - The ID of the IFC model.
 * @param ifcItem - The IFC item whose type and properties are to be set.
 *
 * This function retrieves the type and properties of an IFC item based on its express ID.
 * It collects all relevant relationships (IfcRelDefines, IfcRelAggregates, IfcRelAssigns) and processes
 * them to extract property sets. The extracted properties are then assigned to the `userData` of the IFC item.
 *
 */
const setIfcItemTypeAndProperties = (ifcAPI: IfcAPI, modelID: number, ifcItem: IfcItem): void => {
	const { expressId } = ifcItem.userData
	const data = ifcAPI.GetLine(modelID, expressId, true, true) as IFC2X3.IfcBuildingElement
	const type = ifcAPI.GetNameFromTypeCode(data.type)

	// Array per raccogliere tutte le relazioni trovate
	const relations: (IFC2X3.IfcRelDefines | IFC2X3.IfcRelAggregates | IFC2X3.IfcRelAssigns)[] = []

	if (data.IsDefinedBy) {
		relations.push(...(data.IsDefinedBy as IFC2X3.IfcRelDefines[]))
	}

	if (data.Decomposes) {
		relations.push(...(data.Decomposes as IFC2X3.IfcRelAggregates[]))
	}

	if (data.HasAssignments) {
		relations.push(...(data.HasAssignments as IFC2X3.IfcRelAssigns[]))
	}

	const propertySets: PropertySet[] = []

	for (const relation of relations) {
		switch (relation.type) {
			case IFCRELDEFINESBYPROPERTIES: {
				const relationDefinesByProperties = relation as IFC2X3.IfcRelDefinesByProperties
				const handle = relationDefinesByProperties.RelatingPropertyDefinition as Handle<IFC2X3.IfcPropertySet>
				const propertySetLine = ifcAPI.GetLine(modelID, handle.value, true) as IFC2X3.IfcPropertySet

				if (propertySetLine instanceof IFC2X3.IfcPropertySet) {
					const properties = propertySetLine.HasProperties.map(prop => {
						const propertySingleValue = prop as IFC2X3.IfcPropertySingleValue
						return {
							name: propertySingleValue.Name.value,
							value: propertySingleValue.NominalValue?.value,
						}
					})

					const propertySet = { name: propertySetLine.Name?.value, properties }
					propertySets.push(propertySet)
				}
				break
			}
			case IFCRELDEFINESBYTYPE: {
				// const relationDefinesByType = relation as IFC2X3.IfcRelDefinesByType
				// const relatedObjectsHandles = relationDefinesByType.RelatedObjects as Handle<IFC2X3.IfcObject>[]
				// const relatedTypeHandle = relationDefinesByType.RelatingType as Handle<IFC2X3.IfcTypeObject>
				// console.log('IFCRELDEFINESBYTYPE', relationDefinesByType.Name?.value)
				console.log(`Skipping IFCRELDEFINESBYTYPE`, relation.expressID)
				break
			}
			case IFCRELAGGREGATES: {
				// const relationAggregates = relation as IFC2X3.IfcRelAggregates
				// const relatedObjectsHandles = relationAggregates.RelatedObjects as Handle<IFC2X3.IfcObjectDefinition>[]
				// const relatingObjectHandle = relationAggregates.RelatingObject as Handle<IFC2X3.IfcObjectDefinition>
				// console.log('IFCRELAGGREGATES', relationAggregates.Name?.value)
				console.log(`Skipping IFCRELAGGREGATES`, relation.expressID)
				break
			}
			case IFCRELASSIGNS: {
				// const relationAssigns = relation as IFC2X3.IfcRelAssigns
				// const relatedObjectsHandles = relationAssigns.RelatedObjects as Handle<IFC2X3.IfcObjectDefinition>[]
				// const relatingObjectEnum = relationAssigns.RelatedObjectsType as IFC2X3.IfcObjectTypeEnum
				// console.log('IFCRELASSIGNS', relationAssigns.Name?.value)
				console.log(`Skipping IFCRELAGGREGATES`, relation.expressID)
				break
			}
			default: {
				console.log(`Skipping ${String(relation.type)}`, relation.expressID)
				break
			}
		}
	}

	ifcItem.userData.type = type
	ifcItem.userData.name = data.Name?.value ?? ''
	ifcItem.userData.properties = propertySets
}

/**
 * Finds the value of a specified property from an IFC item.
 *
 * @param ifcItem - The IFC item to search for the property.
 * @param propertyName - The name of the property to find.
 * @returns The value of the specified property, or `undefined` if the property is not found.
 */
const findPropertyValueFromIfcItem = (ifcItem: IfcItem, propertyName: string): Property['value'] | undefined => {
	if (!ifcItem.userData.properties) return undefined

	for (const propertySet of ifcItem.userData.properties) {
		for (const property of propertySet.properties) {
			if (property.name.toLocaleLowerCase() === propertyName.toLocaleLowerCase()) return property.value
		}
	}

	return undefined
}

/**
 * Checks if a given property value matches another property value.
 *
 * @param valueToCheck - The property value to be checked.
 * @param valueToFind - The property value to find.
 * @param precise - If true, checks for an exact match; if false, checks if the valueToFind is included in valueToCheck. Default is true.
 * @returns True if the property values match based on the precise flag, otherwise false.
 */
const isPropertyEqual = (valueToCheck: PropertyValue, valueToFind: PropertyValue, precise = true): boolean => {
	const normalizedValueToCheck = String(valueToCheck).toLowerCase()
	const normalizedValueToFind = String(valueToFind).toLowerCase()
	if (precise) return normalizedValueToCheck === normalizedValueToFind
	return normalizedValueToCheck.includes(normalizedValueToFind)
}

/**
 * Checks if an IFC item has specific properties and optionally matches a specified type.
 *
 * @param ifcItem - The IFC item to check.
 * @param propertiesToFind - An array of properties to look for in the IFC item.
 * @param type - (Optional) The type that the IFC item should match.
 * @returns `true` if the IFC item has all the specified properties and matches the type (if provided), otherwise `false`.
 */
const isPropertiesAndTypeMatched = (ifcItem: IfcItem, propertiesToFind: Property[], type?: string): boolean => {
	// Controlla se l'oggetto ha delle proprietà utente
	if (!ifcItem.userData.properties) return false

	// Controlla se il tipo dell'oggetto corrisponde al tipo specificato (se fornito)
	if (type && ifcItem.userData.type !== type) return false

	// Itera su ciascuna proprietà da trovare
	for (const propertyToFind of propertiesToFind) {
		// Controlla se l'oggetto ha la proprietà specificata
		const valid = isPropertyMatched(ifcItem, propertyToFind)
		if (!valid) return false
	}

	// Se tutte le proprietà corrispondono, ritorna true
	return true
}

/**
 * Checks if a given property exists in an IFC item.
 *
 * @param ifcItem - The IFC item to search within.
 * @param propertyToFind - The property to find, containing a name and value.
 * @returns `true` if the property is found in the IFC item, otherwise `false`.
 *
 * The function searches through the properties of the IFC item and checks if either the name,
 * the value, or both match the provided property to find. If a match is found, it returns `true`.
 * If no match is found, it returns `false`.
 */
const isPropertyMatched = (ifcItem: IfcItem, propertyToFind: Property): boolean => {
	const nameToFind = propertyToFind.name
	const valueToFind = propertyToFind.value

	if (!ifcItem.userData.properties) return false

	// Itera su ciascun set di proprietà nell'oggetto
	for (const propertySet of ifcItem.userData.properties) {
		// Itera su ciascuna proprietà nel set di proprietà
		for (const property of propertySet.properties) {
			const propertyValueAsString = String(property.value)

			// Controlla se solo il nome della proprietà corrisponde
			if (!valueToFind && nameToFind && isPropertyEqual(property.name, nameToFind, false)) {
				return true
			}

			// Controlla se solo il valore della proprietà corrisponde
			if (valueToFind && !nameToFind && isPropertyEqual(propertyValueAsString, valueToFind)) {
				return true
			}

			// Controlla se sia il nome che il valore della proprietà corrispondono
			if (
				valueToFind &&
				nameToFind &&
				isPropertyEqual(property.name, nameToFind, false) &&
				isPropertyEqual(propertyValueAsString, valueToFind)
			) {
				return true
			}
		}
	}

	// Se nessuna proprietà corrisponde, ritorna false
	return false
}

/**
 * Filters IFC items by specified properties and type.
 *
 * @param ifcModel - The IFC model containing items to be filtered.
 * @param propertiesToFind - An array of properties to match against the items.
 * @param type - (Optional) The type of items to filter.
 * @returns An array of IFC items that match the specified properties and type.
 */
const filterIfcItemsByPropertiesAndType = (
	ifcModel: IfcModel,
	propertiesToFind: Property[],
	type?: string,
): IfcItem[] => {
	const foundItems: IfcItem[] = []

	const stack: IfcItem[] = [...ifcModel.children]

	while (stack.length > 0) {
		const current = stack.pop()

		if (!current) continue

		if (isPropertiesAndTypeMatched(current, propertiesToFind, type)) {
			foundItems.push(current)
		}
	}

	return foundItems
}

/**
 * Checks if an IFC item meets the specified requirements.
 *
 * @param ifcItem - The IFC item to be validated.
 * @param requirements - The requirements that the IFC item must meet. If undefined, the item is considered valid.
 * @returns `true` if the IFC item meets the requirements, `false` otherwise.
 */
const doesIfcItemSatisfiesRequirements = (ifcItem: IfcItem, requirements: Requirements | undefined): boolean => {
	// Check if there are any selection requirements
	if (!requirements) {
		return true
	}

	// Check if the object is the correct type
	if (requirements.requiredType && ifcItem.userData.type !== requirements.requiredType) {
		return false
	}

	// Check if the object has no properties
	if (!requirements.requiredProperties || requirements.requiredProperties.length === 0) {
		return true
	}

	// Check if the object has the required properties
	if (!isPropertiesAndTypeMatched(ifcItem, requirements.requiredProperties)) {
		return false
	}

	return true
}

const removePropertiesFromIfcItems = (ifcModel: IfcModel): void => {
	for (const ifcItem of ifcModel.children) {
		delete ifcItem.userData.properties
	}
}

/**
 * Sets the `selectable` property of an `IfcItem` based on the provided requirements.
 *
 * @param ifcItem - The IFC item to be evaluated and potentially marked as selectable.
 * @param ifcModel - The IFC model containing the item and its related items.
 * @param requirements - An array of selectable requirements that the `ifcItem` must satisfy.
 *
 * The function iterates through the provided requirements to determine if the `ifcItem`
 * meets any of them. If a requirement is met, the `selectable` property of the `ifcItem`
 * is set to `true`. If the requirement includes `linkRequirements`, the function also
 * checks related items in the `ifcModel` to see if they satisfy the link requirements.
 */
const setIfcItemSelectable = (ifcItem: IfcItem, ifcModel: IfcModel, requirements: SelectableRequirements[]): void => {
	let selectable = false

	for (const selectableRequirement of requirements) {
		if (selectable) {
			break
		}
		if (!doesIfcItemSatisfiesRequirements(ifcItem, selectableRequirement)) {
			continue
		}

		const { linkRequirements } = selectableRequirement

		if (!linkRequirements) {
			selectable = true
			break
		}

		const links = ifcItem.userData.links ?? {}
		const linkItems = ifcModel.children.filter(linkItem => linkItem.userData.expressId in links)

		for (const linkItem of linkItems) {
			if (doesIfcItemSatisfiesRequirements(linkItem, linkRequirements)) {
				selectable = true
				break
			}
		}
	}

	ifcItem.userData.selectable = selectable
}

/**
 * Sets the `alwaysVisible` property of an `IfcItem` based on the provided requirements.
 *
 * @param ifcItem - The IFC item to be evaluated.
 * @param requirements - An array of requirements that the IFC item must satisfy to be always visible.
 */
const setIfcItemAlwaysVisible = (ifcItem: IfcItem, requirements: Requirements[]): void => {
	let alwaysVisible = true

	for (const selectableRequirement of requirements) {
		if (!doesIfcItemSatisfiesRequirements(ifcItem, selectableRequirement)) {
			alwaysVisible = false
			break
		}
	}
	ifcItem.userData.alwaysVisible = alwaysVisible
}

/**
 * Sets the links for a given IFC item based on the specified link requirements.
 *
 * @param ifcItem - The IFC item for which the links are to be set.
 * @param ifcModel - The IFC model containing the items to be linked.
 * @param linkRequirements - An array of link requirements that specify the properties and values to be used for linking.
 *
 * The function iterates over the provided link requirements and finds the corresponding property values in the IFC item.
 * It then searches for other items in the IFC model that match these properties and sets the links accordingly.
 *
 * The links are stored in the `userData.links` property of the IFC item, where the key is the link property name and the value is an array of express IDs of the linked items.
 */
const setIfcItemLinks = (ifcItem: IfcItem, ifcModel: IfcModel, linkRequirements: LinkRequirements[]): void => {
	const links: Record<string, ExpressId[]> = {}

	for (const linkRequirement of linkRequirements) {
		const { linkPropertyName } = linkRequirement

		const propertiesToFind: Property[] = []

		const linkPropertyValue = findPropertyValueFromIfcItem(ifcItem, linkPropertyName)
		// If the link property has no value, any comparison can be made, so no relative can be founbd
		if (!linkPropertyValue) {
			return
		}

		propertiesToFind.push({ name: linkPropertyName, value: linkPropertyValue })

		if (linkRequirement.requiredProperties) {
			for (const requiredProperty of linkRequirement.requiredProperties) {
				propertiesToFind.push(requiredProperty)
			}
		}

		const linkedItems = filterIfcItemsByPropertiesAndType(ifcModel, propertiesToFind)

		links[linkPropertyName] = linkedItems.map(linkedItem => linkedItem.userData.expressId)
	}

	ifcItem.userData.links = links
}

const setIfcData = (
	ifcModel: IfcModel,
	linkRequirements?: LinkRequirements[],
	selectableRequirement?: SelectableRequirements[],
	alwaysVisibleRequirement?: Requirements[],
	anchorsRequirement?: Requirements[],
) => {
	console.log('Setting IFC data')
	for (const ifcItem of ifcModel.children) {
		if (linkRequirements) {
			setIfcItemLinks(ifcItem, ifcModel, linkRequirements)
		}
		if (selectableRequirement) {
			setIfcItemSelectable(ifcItem, ifcModel, selectableRequirement)
		}
		if (alwaysVisibleRequirement) {
			setIfcItemAlwaysVisible(ifcItem, alwaysVisibleRequirement)
		}
	}
}

export {
	doesIfcItemSatisfiesRequirements,
	filterIfcItemsByPropertiesAndType,
	findPropertyValueFromIfcItem,
	removePropertiesFromIfcItems,
	setIfcData,
	setIfcItemAlwaysVisible,
	setIfcItemLinks,
	setIfcItemSelectable,
	setIfcItemTypeAndProperties,
}
