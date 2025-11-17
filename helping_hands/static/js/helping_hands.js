/**
 * GlobalHandler - Manages all site-wide interactions and AJAX operations
 * 
 * Expected JSON Response Formats:
 * 
 * Success Response:
 * {
 *   "success": true,
 *   "message": "Operation completed successfully",
 *   "data": { ... } // Optional additional data
 * }
 * 
 * Error Response:
 * {
 *   "success": false,
 *   "message": "Error message",
 *   "errors": { ... } // Optional field-specific errors
 * }
 */
class GlobalHandler {
    constructor() {
        this.initEventListeners();
        this.csrfToken = this.getCSRFToken();
    }

    /**
     * Gets CSRF token from cookie or meta tag
     * @returns {string} CSRF token
     */
    getCSRFToken() {
        // Try to get from cookie first (Django default)
        const cookieValue = document.cookie
            .split('; ')
            .find(row => row.startsWith('csrftoken='))
            ?.split('=')[1];
        
        // Fallback to meta tag
        return cookieValue || $('meta[name="csrf-token"]').attr('content') || '';
    }

    /**
     * Initializes all the event listeners for the site.
     */
    initEventListeners() {
        // Form submissions
        $(document).on('submit', '#contact-form', this.handleFormSubmission.bind(this));
        $(document).on('submit', '#registration-form', this.handleEventRegistration.bind(this));
        $(document).on('submit', '#volunteer-form', this.handleVolunteerSignUp.bind(this));
        $(document).on('submit', '#donation-form', this.handleDonationProcessing.bind(this));

        // Event details
        $(document).on('click', '.event-details-btn', this.loadEventDetails.bind(this));

        // Utility functions
        $(document).on('click', '.smooth-scroll', this.smoothScroll);
        $(document).on('click', '#mobile-nav-toggle', this.toggleMobileNavbar);
    }

    /**
     * Validates form before submission
     * @param {jQuery} form - The form element
     * @returns {Object} Validation result {isValid: boolean, errors: Array}
     */
    validateForm(form) {
        const errors = [];
        const requiredFields = form.find('[required]');

        requiredFields.each(function() {
            const field = $(this);
            const value = field.val().trim();
            const fieldName = field.attr('name') || field.attr('id');

            if (!value) {
                errors.push(`${fieldName} is required`);
                field.addClass('is-invalid');
            } else {
                field.removeClass('is-invalid');
            }

            // Email validation
            if (field.attr('type') === 'email' && value) {
                const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
                if (!emailRegex.test(value)) {
                    errors.push(`${fieldName} must be a valid email address`);
                    field.addClass('is-invalid');
                }
            }

            // Phone validation (basic)
            if (field.attr('type') === 'tel' && value) {
                const phoneRegex = /^[\d\s\-\+\(\)]+$/;
                if (!phoneRegex.test(value)) {
                    errors.push(`${fieldName} must be a valid phone number`);
                    field.addClass('is-invalid');
                }
            }
        });

        return {
            isValid: errors.length === 0,
            errors: errors
        };
    }

    /**
     * Handles generic form submissions via AJAX.
     * @param {Event} e - The form submission event
     * 
     * Expected JSON Response:
     * Success: { "success": true, "message": "Form submitted successfully" }
     * Error: { "success": false, "message": "Error message", "errors": {...} }
     */
    handleFormSubmission(e) {
        e.preventDefault();
        const form = $(e.target);
        const url = form.attr('action');
        
        // Validate form
        const validation = this.validateForm(form);
        if (!validation.isValid) {
            this.showToastNotification('error', validation.errors.join('<br>'));
            return;
        }

        const data = form.serialize();
        this.showLoadingAnimation(true);

        $.ajax({
            type: 'POST',
            url: url,
            data: data,
            dataType: 'json',
            headers: {
                'X-CSRFToken': this.csrfToken
            },
            success: (response) => {
                this.showLoadingAnimation(false);
                if (response.success) {
                    this.showToastNotification('success', response.message || 'Form submitted successfully');
                    form[0].reset();
                    form.find('.is-invalid').removeClass('is-invalid');
                    
                    // Trigger custom event for other handlers
                    $(document).trigger('formSubmitted', [response.data]);
                } else {
                    this.handleFormErrors(form, response);
                }
            },
            error: (xhr, status, error) => {
                this.showLoadingAnimation(false);
                this.handleAjaxError(xhr, status, error);
            }
        });
    }

    /**
     * Handles form-specific errors
     * @param {jQuery} form - The form element
     * @param {Object} response - Server response
     */
    handleFormErrors(form, response) {
        const message = response.message || 'Form submission failed';
        this.showToastNotification('error', message);

        // Display field-specific errors
        if (response.errors) {
            Object.keys(response.errors).forEach(fieldName => {
                const field = form.find(`[name="${fieldName}"]`);
                field.addClass('is-invalid');
                
                // Add error message under field if feedback div exists
                const feedback = field.siblings('.invalid-feedback');
                if (feedback.length) {
                    feedback.text(response.errors[fieldName]);
                }
            });
        }
    }

    /**
     * Handles AJAX errors with detailed logging
     * @param {Object} xhr - XMLHttpRequest object
     * @param {string} status - Error status
     * @param {string} error - Error message
     */
    handleAjaxError(xhr, status, error) {
        console.error('AJAX Error:', {
            status: status,
            error: error,
            responseText: xhr.responseText,
            statusCode: xhr.status
        });

        let errorMessage = 'An unexpected error occurred.';
        
        // Handle specific HTTP status codes
        switch(xhr.status) {
            case 400:
                errorMessage = 'Bad request. Please check your input.';
                break;
            case 401:
                errorMessage = 'Unauthorized. Please log in.';
                break;
            case 403:
                errorMessage = 'Forbidden. You do not have permission.';
                break;
            case 404:
                errorMessage = 'Resource not found.';
                break;
            case 500:
                errorMessage = 'Server error. Please try again later.';
                break;
        }

        // Try to parse JSON error response
        try {
            const response = JSON.parse(xhr.responseText);
            if (response.message) {
                errorMessage = response.message;
            }
        } catch (e) {
            // Response is not JSON, use default message
        }

        this.showToastNotification('error', errorMessage);
    }

    /**
     * Handles event registration form submissions.
     * @param {Event} e - The form submission event
     * 
     * Expected JSON Response:
     * {
     *   "success": true,
     *   "message": "Successfully registered for event",
     *   "data": {
     *     "registration_id": "REG-12345",
     *     "event_name": "Community Fundraiser",
     *     "event_date": "2024-01-15",
     *     "confirmation_email": "user@example.com"
     *   }
     * }
     */
    handleEventRegistration(e) {
        e.preventDefault();
        const form = $(e.target);
        
        console.log('Handling event registration...');
        
        // Validate form
        const validation = this.validateForm(form);
        if (!validation.isValid) {
            this.showToastNotification('error', validation.errors.join('<br>'));
            return;
        }

        const url = form.attr('action');
        const data = form.serialize();
        this.showLoadingAnimation(true);

        $.ajax({
            type: 'POST',
            url: url,
            data: data,
            dataType: 'json',
            headers: {
                'X-CSRFToken': this.csrfToken
            },
            success: (response) => {
                this.showLoadingAnimation(false);
                if (response.success) {
                    this.showToastNotification('success', response.message);
                    form[0].reset();
                    
                    // Display registration confirmation if data provided
                    if (response.data && response.data.registration_id) {
                        this.showRegistrationConfirmation(response.data);
                    }
                    
                    $(document).trigger('eventRegistered', [response.data]);
                } else {
                    this.handleFormErrors(form, response);
                }
            },
            error: (xhr, status, error) => {
                this.showLoadingAnimation(false);
                this.handleAjaxError(xhr, status, error);
            }
        });
    }

    /**
     * Displays registration confirmation details
     * @param {Object} data - Registration data
     */
    showRegistrationConfirmation(data) {
        const confirmationHtml = `
            <div class="alert alert-success mt-3" role="alert">
                <h5>Registration Confirmed!</h5>
                <p><strong>Registration ID:</strong> ${data.registration_id}</p>
                <p><strong>Event:</strong> ${data.event_name}</p>
                <p><strong>Date:</strong> ${data.event_date}</p>
                <p>A confirmation email has been sent to ${data.confirmation_email}</p>
            </div>
        `;
        $('#registration-confirmation').html(confirmationHtml);
    }

    /**
     * Handles volunteer sign-up form submissions.
     * @param {Event} e - The form submission event
     * 
     * Expected JSON Response:
     * {
     *   "success": true,
     *   "message": "Thank you for volunteering!",
     *   "data": {
     *     "volunteer_id": "VOL-67890",
     *     "name": "John Doe",
     *     "areas_of_interest": ["Education", "Healthcare"],
     *     "next_steps": "Our coordinator will contact you within 48 hours"
     *   }
     * }
     */
    handleVolunteerSignUp(e) {
        e.preventDefault();
        const form = $(e.target);
        
        console.log('Handling volunteer sign-up...');
        
        // Validate form
        const validation = this.validateForm(form);
        if (!validation.isValid) {
            this.showToastNotification('error', validation.errors.join('<br>'));
            return;
        }

        const url = form.attr('action');
        const data = form.serialize();
        this.showLoadingAnimation(true);

        $.ajax({
            type: 'POST',
            url: url,
            data: data,
            dataType: 'json',
            headers: {
                'X-CSRFToken': this.csrfToken
            },
            success: (response) => {
                this.showLoadingAnimation(false);
                if (response.success) {
                    this.showToastNotification('success', response.message);
                    form[0].reset();
                    
                    if (response.data) {
                        this.showVolunteerWelcome(response.data);
                    }
                    
                    $(document).trigger('volunteerSignedUp', [response.data]);
                } else {
                    this.handleFormErrors(form, response);
                }
            },
            error: (xhr, status, error) => {
                this.showLoadingAnimation(false);
                this.handleAjaxError(xhr, status, error);
            }
        });
    }

    /**
     * Displays volunteer welcome message
     * @param {Object} data - Volunteer data
     */
    showVolunteerWelcome(data) {
        const welcomeHtml = `
            <div class="alert alert-info mt-3" role="alert">
                <h5>Welcome, ${data.name}!</h5>
                <p><strong>Volunteer ID:</strong> ${data.volunteer_id}</p>
                ${data.next_steps ? `<p>${data.next_steps}</p>` : ''}
            </div>
        `;
        $('#volunteer-welcome').html(welcomeHtml);
    }

    /**
     * Handles donation processing form submissions.
     * @param {Event} e - The form submission event
     * 
     * Expected JSON Response:
     * {
     *   "success": true,
     *   "message": "Thank you for your donation!",
     *   "data": {
     *     "transaction_id": "TXN-98765",
     *     "amount": 50.00,
     *     "currency": "USD",
     *     "receipt_url": "/receipts/TXN-98765",
     *     "campaign_progress": {
     *       "current": 7500,
     *       "goal": 10000,
     *       "percentage": 75
     *     }
     *   }
     * }
     */
    handleDonationProcessing(e) {
        e.preventDefault();
        const form = $(e.target);
        const amount = form.find('input[name="amount"]').val();

        // Validate amount
        if (!amount || parseFloat(amount) <= 0) {
            this.showToastNotification('error', 'Please enter a valid donation amount');
            return;
        }

        // Validate form
        const validation = this.validateForm(form);
        if (!validation.isValid) {
            this.showToastNotification('error', validation.errors.join('<br>'));
            return;
        }

        console.log(`Processing donation of $${amount}...`);
        
        const url = form.attr('action');
        const data = form.serialize();
        this.showLoadingAnimation(true);

        $.ajax({
            type: 'POST',
            url: url,
            data: data,
            dataType: 'json',
            headers: {
                'X-CSRFToken': this.csrfToken
            },
            success: (response) => {
                this.showLoadingAnimation(false);
                if (response.success) {
                    this.showToastNotification('success', response.message);
                    form[0].reset();
                    
                    // Update progress bar if campaign data provided
                    if (response.data && response.data.campaign_progress) {
                        this.updateDonationProgress(response.data.campaign_progress);
                    }
                    
                    // Show receipt link if provided
                    if (response.data && response.data.receipt_url) {
                        this.showDonationReceipt(response.data);
                    }
                    
                    $(document).trigger('donationProcessed', [response.data]);
                } else {
                    this.handleFormErrors(form, response);
                }
            },
            error: (xhr, status, error) => {
                this.showLoadingAnimation(false);
                this.handleAjaxError(xhr, status, error);
            }
        });
    }

    /**
     * Updates the donation progress bar
     * @param {Object} progress - Progress data with percentage
     */
    updateDonationProgress(progress) {
        const progressBar = $('#donation-progress');
        if (progressBar.length) {
            const percentage = progress.percentage || 0;
            progressBar
                .css('width', percentage + '%')
                .attr('aria-valuenow', percentage)
                .text(percentage + '%');
            
            // Update campaign stats if elements exist
            $('#campaign-current').text(`$${progress.current.toLocaleString()}`);
            $('#campaign-goal').text(`$${progress.goal.toLocaleString()}`);
        }
    }

    /**
     * Displays donation receipt information
     * @param {Object} data - Donation data
     */
    showDonationReceipt(data) {
        const receiptHtml = `
            <div class="alert alert-success mt-3" role="alert">
                <h5>Thank you for your donation!</h5>
                <p><strong>Transaction ID:</strong> ${data.transaction_id}</p>
                <p><strong>Amount:</strong> $${data.amount} ${data.currency}</p>
                <p><a href="${data.receipt_url}" target="_blank" class="btn btn-sm btn-outline-success">Download Receipt</a></p>
            </div>
        `;
        $('#donation-receipt').html(receiptHtml);
    }

    /**
     * Loads event details via AJAX and displays them in a modal.
     * @param {Event} e - The click event
     * 
     * Expected JSON Response:
     * {
     *   "success": true,
     *   "data": {
     *     "id": 123,
     *     "title": "Community Fundraiser",
     *     "description": "Join us for a wonderful community event...",
     *     "date": "2024-01-15",
     *     "time": "14:00",
     *     "location": "Community Center",
     *     "capacity": 100,
     *     "registered": 45,
     *     "organizer": "Helping Hands Foundation",
     *     "image_url": "/media/events/fundraiser.jpg"
     *   }
     * }
     */
    loadEventDetails(e) {
        e.preventDefault();
        const eventId = $(e.currentTarget).data('event-id');
        
        if (!eventId) {
            this.showToastNotification('error', 'Event ID not found');
            return;
        }

        this.showLoadingAnimation(true);

        $.ajax({
            type: 'GET',
            url: `/api/events/${eventId}/`,
            dataType: 'json',
            success: (response) => {
                this.showLoadingAnimation(false);
                if (response.success && response.data) {
                    this.displayEventModal(response.data);
                } else {
                    this.showToastNotification('error', response.message || 'Failed to load event details');
                }
            },
            error: (xhr, status, error) => {
                this.showLoadingAnimation(false);
                this.handleAjaxError(xhr, status, error);
            }
        });
    }

    /**
     * Displays event details in a modal
     * @param {Object} eventData - Event details
     */
    displayEventModal(eventData) {
        $('#event-modal-title').text(eventData.title);
        
        const modalBody = `
            ${eventData.image_url ? `<img src="${eventData.image_url}" class="img-fluid mb-3" alt="${eventData.title}">` : ''}
            <p>${eventData.description}</p>
            <div class="event-details">
                <p><strong>Date:</strong> ${eventData.date}${eventData.time ? ` at ${eventData.time}` : ''}</p>
                ${eventData.location ? `<p><strong>Location:</strong> ${eventData.location}</p>` : ''}
                ${eventData.organizer ? `<p><strong>Organizer:</strong> ${eventData.organizer}</p>` : ''}
                ${eventData.capacity ? `<p><strong>Availability:</strong> ${eventData.registered || 0} / ${eventData.capacity} spots filled</p>` : ''}
            </div>
        `;
        
        $('#event-modal-body').html(modalBody);
        
        // Bootstrap 5 modal
        const modal = new bootstrap.Modal(document.getElementById('event-modal'));
        modal.show();
    }

    /**
     * Shows or hides a loading animation.
     * @param {boolean} show - Whether to show or hide the loading animation.
     */
    showLoadingAnimation(show) {
        const spinner = $('#loading-spinner');
        if (show) {
            spinner.fadeIn(200);
        } else {
            spinner.fadeOut(200);
        }
    }

    /**
     * Smoothly scrolls to a target section.
     * @param {Event} e - The click event.
     */
    smoothScroll(e) {
        e.preventDefault();
        const target = $(this).attr('href');
        const targetElement = $(target);
        
        if (targetElement.length) {
            $('html, body').animate({
                scrollTop: targetElement.offset().top - 80 // Account for fixed navbar
            }, 800, 'swing');
        }
    }

    /**
     * Toggles the mobile navigation bar.
     */
    toggleMobileNavbar() {
        const nav = $('#main-nav');
        nav.toggleClass('is-open');
        
        // Update ARIA attributes for accessibility
        const isOpen = nav.hasClass('is-open');
        $('#mobile-nav-toggle').attr('aria-expanded', isOpen);
    }

    /**
     * Shows a toast notification.
     * @param {string} type - 'success', 'error', 'warning', or 'info'
     * @param {string} message - The message to display
     * @param {number} duration - Duration in milliseconds (default: 5000)
     */
    showToastNotification(type, message, duration = 5000) {
        const bgClass = {
            'success': 'bg-success',
            'error': 'bg-danger',
            'warning': 'bg-warning',
            'info': 'bg-info'
        }[type] || 'bg-secondary';

        const toast = $(`
            <div class="toast align-items-center text-white ${bgClass} border-0" role="alert" aria-live="assertive" aria-atomic="true" data-bs-delay="${duration}">
                <div class="d-flex">
                    <div class="toast-body">${message}</div>
                    <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="Close"></button>
                </div>
            </div>
        `);

        const container = $('#toast-container');
        if (!container.length) {
            $('body').append('<div id="toast-container" class="toast-container position-fixed top-0 end-0 p-3"></div>');
        }
        
        $('#toast-container').append(toast);
        const bsToast = new bootstrap.Toast(toast[0], {
            autohide: true,
            delay: duration
        });
        bsToast.show();

        // Remove toast from DOM after it's hidden
        toast.on('hidden.bs.toast', function() {
            $(this).remove();
        });
    }
}

// Initialize the GlobalHandler when the document is ready
$(document).ready(() => {
    window.globalHandler = new GlobalHandler();
});
