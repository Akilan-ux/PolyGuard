// Dropdown Menu Functionality
document.addEventListener('DOMContentLoaded', function() {
    const dropdowns = document.querySelectorAll('.nav-item');
    
    dropdowns.forEach(dropdown => {
        const button = dropdown.querySelector('.nav-link');
        
        // Open dropdown on click
        button.addEventListener('click', function(e) {
            e.stopPropagation();
            const menu = dropdown.querySelector('.dropdown-menu');
            
            // Close other dropdowns
            dropdowns.forEach(d => {
                if (d !== dropdown) {
                    const otherMenu = d.querySelector('.dropdown-menu');
                    if (otherMenu) {
                        otherMenu.style.display = 'none';
                    }
                }
            });
            
            // Toggle current dropdown
            if (menu.style.display === 'block') {
                menu.style.display = 'none';
            } else {
                menu.style.display = 'block';
            }
        });
    });
    
    // Close dropdowns when clicking elsewhere
    document.addEventListener('click', function() {
        dropdowns.forEach(dropdown => {
            const menu = dropdown.querySelector('.dropdown-menu');
            if (menu) {
                menu.style.display = 'none';
            }
        });
    });
});

// Smooth Scroll for anchor links
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function(e) {
        const href = this.getAttribute('href');
        if (href !== '#') {
            e.preventDefault();
            const element = document.querySelector(href);
            if (element) {
                element.scrollIntoView({ behavior: 'smooth' });
            }
        }
    });
});

// Demo request alert for demo buttons only (exclude anchors linking to demo page)
document.querySelectorAll('.btn-primary, .btn-secondary').forEach(button => {
    // skip if this is an anchor nav link (nav-demo-btn) — we want links to navigate normally
    if (button.classList.contains('nav-demo-btn') && button.tagName === 'A') return;
    button.addEventListener('click', function(e) {
        const text = this.textContent.trim();
        if (text === 'Request Demo' || text.includes('Request Demo')) {
            console.log('Demo requested');
            alert('Thank you for your interest! Our team will contact you shortly with demo details.');
        }
    });
});

// Add smooth animations on scroll
const observerOptions = {
    threshold: 0.1,
    rootMargin: '0px 0px -100px 0px'
};

const observer = new IntersectionObserver(function(entries) {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            entry.target.style.opacity = '1';
            entry.target.style.transform = 'translateY(0)';
        }
    });
}, observerOptions);

// Observe all cards and sections
document.querySelectorAll('.overview-card, .trust-card, .pricing-card, .security-item').forEach(element => {
    element.style.opacity = '0';
    element.style.transform = 'translateY(20px)';
    element.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
    observer.observe(element);
});

// Mobile menu toggle
function initMobileMenu() {
    const navMenu = document.querySelector('.navbar-menu');
    
    if (window.innerWidth <= 768) {
        navMenu.style.display = 'none';
    }
}

// Initialize on page load
initMobileMenu();
window.addEventListener('resize', initMobileMenu);
