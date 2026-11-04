import { useState, useRef, useEffect } from 'react'
import { getEmployeeAvatar, EMPLOYEE_NAMES } from './employeeUtils'

export default function EmployeeSelect({
  id,
  value = '',
  onChange,
  disabled = false,
  required = false,
  placeholder = 'Select an employee',
  includeUnassigned = false,
  unassignedLabel = 'Unassigned',
  unassignedValue = '',
  includeOther = true,
  otherLabel = '👤 Other (enter name)',
  otherValue = '__other__',
  ariaLabel,
}) {
  const [isOpen, setIsOpen] = useState(false)
  const containerRef = useRef(null)

  // Handle click outside to close dropdown
  useEffect(() => {
    function handleClickOutside(event) {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setIsOpen(false)
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      document.addEventListener('touchstart', handleClickOutside)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('touchstart', handleClickOutside)
    }
  }, [isOpen])

  // Handle keyboard escape
  useEffect(() => {
    function handleKeyDown(event) {
      if (event.key === 'Escape' && isOpen) {
        setIsOpen(false)
      }
    }

    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown)
    }

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen])

  const handleSelect = (selectedValue) => {
    if (disabled) return
    setIsOpen(false)
    if (onChange) {
      // Send synthetic-compatible event object
      onChange({
        target: {
          value: selectedValue,
          name: id,
        },
      })
    }
  }

  // Determine current display info
  const isSelected = Boolean(value)
  const isUnassigned = includeUnassigned && (value === unassignedValue || (!value && !required))
  const isOther = includeOther && value === otherValue
  const isKnownEmployee = EMPLOYEE_NAMES.includes(value)
  const currentAvatar = isKnownEmployee ? getEmployeeAvatar(value) : null

  return (
    <div
      className={`custom-employee-select-container ${isOpen ? 'is-open' : ''} ${disabled ? 'is-disabled' : ''}`}
      ref={containerRef}
    >
      {/* Hidden input for form validation compatibility */}
      {required && (
        <input
          tabIndex={-1}
          autoComplete="off"
          style={{ opacity: 0, width: 0, height: 0, position: 'absolute', pointerEvents: 'none' }}
          value={value}
          required={required}
          onChange={() => {}}
        />
      )}

      {/* Trigger Button */}
      <button
        type="button"
        id={id}
        className={`custom-employee-select-trigger ${!isSelected && !isUnassigned ? 'is-placeholder' : ''}`}
        onClick={() => !disabled && setIsOpen((prev) => !prev)}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-label={ariaLabel || placeholder}
      >
        <span className="trigger-content">
          {currentAvatar ? (
            <img
              src={currentAvatar}
              alt=""
              className="employee-avatar-badge"
              width="24"
              height="24"
            />
          ) : isOther ? (
            <span className="employee-avatar-badge icon-fallback">👤</span>
          ) : isUnassigned ? (
            <span className="employee-avatar-badge icon-fallback unassigned-circle" />
          ) : null}

          <span className="trigger-label">
            {isKnownEmployee
              ? value
              : isOther
                ? otherLabel
                : isUnassigned
                  ? unassignedLabel
                  : placeholder}
          </span>
        </span>

        <span className="trigger-chevron" aria-hidden="true">
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </span>
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="custom-employee-dropdown-menu" role="listbox">
          {includeUnassigned && (
            <button
              type="button"
              className={`dropdown-option-item ${value === unassignedValue ? 'is-active' : ''}`}
              role="option"
              aria-selected={value === unassignedValue}
              onClick={() => handleSelect(unassignedValue)}
            >
              <span className="employee-avatar-badge icon-fallback unassigned-circle" />
              <span className="option-name">{unassignedLabel}</span>
              {value === unassignedValue && <span className="option-check">✓</span>}
            </button>
          )}

          {EMPLOYEE_NAMES.map((name) => {
            const avatar = getEmployeeAvatar(name)
            const isActive = value === name

            return (
              <button
                key={name}
                type="button"
                className={`dropdown-option-item ${isActive ? 'is-active' : ''}`}
                role="option"
                aria-selected={isActive}
                onClick={() => handleSelect(name)}
              >
                <img
                  src={avatar}
                  alt=""
                  className="employee-avatar-badge"
                  width="26"
                  height="26"
                />
                <span className="option-name">{name}</span>
                {isActive && <span className="option-check">✓</span>}
              </button>
            )
          })}

          {includeOther && (
            <button
              type="button"
              className={`dropdown-option-item ${value === otherValue ? 'is-active' : ''}`}
              role="option"
              aria-selected={value === otherValue}
              onClick={() => handleSelect(otherValue)}
            >
              <span className="employee-avatar-badge icon-fallback">👤</span>
              <span className="option-name">{otherLabel}</span>
              {value === otherValue && <span className="option-check">✓</span>}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
