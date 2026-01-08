import imaplib
import email
from email.header import decode_header
import re
from datetime import datetime
import time
import json

# Email configuration
EMAIL = "solss1302@gmail.com"
PASSWORD = "xefh labv saob dpja"  # Use App Password for Gmail
IMAP_SERVER = "imap.gmail.com"  # Gmail IMAP server

def connect_to_email():      
    """Connect to email server via IMAP"""
    try:
        mail = imaplib.IMAP4_SSL(IMAP_SERVER)
        mail.login(EMAIL, PASSWORD)
        return mail
    except Exception as e:
        print(f"Failed to connect: {e}")
        return None

def parse_airbnb_booking(email_body):
    """Extract booking details from Airbnb email (Vietnamese format)"""
    booking_info = {}
    
    # Tên khách (Guest name) - Tìm tên trong câu "Sabrina sẽ đến vào"
    guest_match = re.search(r"([A-Z][a-z]+)\s+sẽ\s+đến\s+vào", email_body)
    if guest_match:
        booking_info['guest_name'] = guest_match.group(1).strip()
    
    # Nếu không tìm thấy, thử tìm tên trong phần "Gửi tin nhắn cho"
    if not guest_match:
        guest_match2 = re.search(r"Gửi tin nhắn cho\s+([A-Z][a-z]+)", email_body)
        if guest_match2:
            booking_info['guest_name'] = guest_match2.group(1).strip()
    
    # # Ngày nhận phòng (Check-in) - Format: "CN, 20 thg 9" hoặc "Th 5, 24 thg 9"
    checkin_match = re.search(r"Nhận\s+phòng\s*([^\n]*?\d{1,2}\s+thg\s+\d{1,2})", email_body)
    # Nhận phòng\s*\n\s*\n\s*([^]+\d{1,2}\s+thg\s+\d{1,2})
    if checkin_match:
        booking_info['checkin'] = checkin_match.group(1).strip()
    
    # Ngày trả phòng (Check-out)
    checkout_match = re.search(r"Trả\s+phòng\s*([^\n]*?\d{1,2}\s+thg\s+\d{1,2})", email_body)
    if checkout_match:
        booking_info['checkout'] = checkout_match.group(1).strip()
    
    # Giờ nhận phòng
    checkin_time_match = re.search(r"Nhận phòng.*?(\d{1,2}:\d{2})", email_body, re.DOTALL)
    if checkin_time_match:
        booking_info['checkin_time'] = checkin_time_match.group(1)
    
    # Giờ trả phòng
    checkout_time_match = re.search(r"Trả phòng.*?(\d{1,2}:\d{2})", email_body, re.DOTALL)
    if checkout_time_match:
        booking_info['checkout_time'] = checkout_time_match.group(1)
    
    # Mã xác nhận (Confirmation code)
    conf_match = re.search(r"Mã\s+xác\s+nhận\s*([A-Z0-9]+)", email_body)
    if conf_match:
        booking_info['confirmation'] = conf_match.group(1).strip()
    
    # Số lượng khách (Number of guests) - "2 người lớn"
    guests_match = re.search(r"Khách\s*(\d+)\s+người\s+lớn", email_body)
    if guests_match:
        booking_info['num_guests'] = guests_match.group(1)
    
    # Số đêm (Number of nights)
    nights_match = re.search(r"(\d+)\s+đêm", email_body)
    if nights_match:
        booking_info['nights'] = nights_match.group(1)
    
    # Tên phòng (Listing name)
    listing_match = re.search(r"\[image:\s*([^\]]+)\]", email_body)
    if listing_match:
        booking_info['listing_name'] = listing_match.group(1).strip()
    
    return booking_info


def get_email_body(msg):
    """Extract email body from email message"""
    body = ""
    if msg.is_multipart():
        for part in msg.walk():
            content_type = part.get_content_type()
            if content_type == "text/plain":
                try:
                    body = part.get_payload(decode=True).decode()
                    break
                except:
                    pass
            elif content_type == "text/html" and not body:
                try:
                    body = part.get_payload(decode=True).decode()
                except:
                    pass
    else:
        try:
            body = msg.get_payload(decode=True).decode()
        except:
            pass
    return body

def check_new_bookings():
    """Check for new Airbnb booking emails"""
    mail = connect_to_email()
    if not mail:
        return []
    
    try:
        # Select inbox
        mail.select("inbox")
        
        # Search for unread emails from Airbnb
        # Adjust the sender email based on what Airbnb actually uses
        status, messages = mail.search(None, '(UNSEEN FROM "quangnhat.nydo@gmail.com")') # change to airbnb later
        
        if status != "OK":
            print("No new messages")
            return []
        
        email_ids = messages[0].split()
        new_bookings = []
        
        for email_id in email_ids:
            # Fetch the email
            status, msg_data = mail.fetch(email_id, "(RFC822)")
            
            if status != "OK":
                continue
            
            # Parse email
            for response_part in msg_data:
                if isinstance(response_part, tuple):
                    msg = email.message_from_bytes(response_part[1])
                    
                    # Get subject
                    subject = decode_header(msg["Subject"])[0][0]
                    if isinstance(subject, bytes):
                        subject = subject.decode()
                    
                    # Check if it's a booking confirmation
                    if "đặt phòng" in subject.lower() or "xác nhận" in subject.lower():
                        # Get email body
                        body = get_email_body(msg)
                        
                        # Parse booking details
                        booking_info = parse_airbnb_booking(body)
                        booking_info['subject'] = subject
                        booking_info['received_at'] = datetime.now().isoformat()
                        new_bookings.append(booking_info)
                        
                        print(f"\nNew Booking Detected!")
                        print(f"Subject: {subject}")
                        
                        # Optional: Mark as read after processing
                        # mail.store(email_id, '+FLAGS', '\\Seen')
        
        mail.close()
        mail.logout()
        return new_bookings
        
    except Exception as e:
        print(f"Error checking emails: {e}")
        return []

def notify_new_booking(booking_info):
    """
    Send notification about new booking to your system
    Customize this based on your needs:
    - Send webhook to your app
    - Save to database
    - Send SMS/push notification
    - etc.
    """
    # Example: Print to console
    print("\n" + "="*50)
    print("NEW BOOKING NOTIFICATION")
    print("="*50)
    for key, value in booking_info.items():
        print(f"{key}: {value}")
    print("="*50 + "\n")
    
    # TODO: Add your custom notification logic here
    # Example webhook:
    # import requests
    # requests.post("https://your-app.com/webhook/new-booking", json=booking_info)

def main():
    """Main monitoring loop"""
    print("🏠 Airbnb Booking Monitor Started")
    print(f"Checking email: {EMAIL}")
    print("Press Ctrl+C to stop\n")
    
    CHECK_INTERVAL = 5  # Check every 5 seconds
    
    while True:
        try:
            print(f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] Checking for new bookings...")
            
            new_bookings = check_new_bookings()
            
            if new_bookings:
                for booking in new_bookings:
                    print(f"New booking from {booking.get('guest_name', 'Unknown')}: {booking.get('checkin', 'N/A')} to {booking.get('checkout', 'N/A')}")
                    notify_new_booking(booking)
                print(f"Total new bookings found: {len(new_bookings)}")
                
            else:
                print("No new bookings found.")
            
            print(f"Next check in {CHECK_INTERVAL} seconds...\n")
            time.sleep(CHECK_INTERVAL)
            
        except KeyboardInterrupt:
            print("\n\n👋 Monitoring stopped by user")
            break
        except Exception as e:
            print(f"Error in main loop: {e}")
            time.sleep(60)  # Wait 1 minute before retrying

if __name__ == "__main__":
    main()