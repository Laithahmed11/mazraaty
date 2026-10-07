import Foundation

struct Farm: Codable, Identifiable, Hashable, Sendable {
    let id: String
    let name: String
    let governorate: String
    let area: String
    let description: String
    let priceIQD: Int
    let capacity: Int
    let images: [String]
    let amenities: [String]
    let latitude: Double?
    let longitude: Double?
    let bookingUrl: String?
    let wixServiceId: String?

    var locationLabel: String {
        [governorate, area].filter { !$0.isEmpty }.joined(separator: "، ")
    }

    var canRequestBooking: Bool { capacity > 0 && priceIQD > 0 }
    var officialBookingURL: URL? {
        guard let bookingUrl, let url = URL(string: bookingUrl), url.scheme == "https", url.host != nil else { return nil }
        return url
    }
}

struct Booking: Codable, Identifiable, Sendable {
    let id: String
    let farmId: String
    let farmName: String
    let date: String
    let guests: Int
    let customerName: String
    let phone: String
    let notes: String
    let totalIQD: Int
    var status: String
    let createdAt: String

    var statusLabel: String {
        switch status {
        case "pending": return "بانتظار الموافقة"
        case "confirmed": return "تم التأكيد"
        case "rejected": return "لم تتم الموافقة"
        case "cancelled": return "ملغي"
        default: return "حالة قيد التحديث"
        }
    }

    var canCancel: Bool {
        status == "pending" && date >= BaghdadDay.string(from: Date())
    }
}

struct CatalogResponse: Codable, Sendable {
    let farms: [Farm]
    let configured: Bool
    let message: String?
}

struct AvailabilityResponse: Codable, Sendable {
    let dates: [String]
    let configured: Bool
    let message: String?
    let advisory: Bool?
    let horizonStart: String?
    let horizonEnd: String?
}

struct BookingsResponse: Codable, Sendable { let bookings: [Booking] }
struct BookingResponse: Codable, Sendable { let booking: Booking }
struct BookingRequest: Encodable, Sendable {
    let farmId: String
    let date: String
    let guests: Int
    let customerName: String
    let phone: String
    let notes: String
    let requestId: String
}

enum BaghdadDay {
    static let timeZone = TimeZone(identifier: "Asia/Baghdad")!
    static var calendar: Calendar {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = timeZone
        return calendar
    }

    static var today: Date { calendar.startOfDay(for: Date()) }

    static func string(from date: Date) -> String {
        let formatter = DateFormatter()
        formatter.calendar = calendar
        formatter.timeZone = timeZone
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter.string(from: date)
    }

    static func display(_ string: String) -> String {
        guard let date = date(from: string) else { return string }
        let formatter = DateFormatter()
        formatter.calendar = calendar
        formatter.timeZone = timeZone
        formatter.locale = Locale(identifier: "ar_IQ")
        formatter.dateStyle = .long
        return formatter.string(from: date)
    }

    static func date(from string: String) -> Date? {
        let parser = DateFormatter()
        parser.calendar = calendar
        parser.timeZone = timeZone
        parser.locale = Locale(identifier: "en_US_POSIX")
        parser.dateFormat = "yyyy-MM-dd"
        return parser.date(from: string)
    }
}

enum IraqiPhone {
    static func normalized(_ input: String) -> String {
        input.reduce(into: "") { result, character in
            if let digit = character.wholeNumberValue { result += String(digit) }
            else if character == "+" && result.isEmpty { result += "+" }
        }
    }

    static func isValid(_ input: String) -> Bool {
        normalized(input).range(of: "^(07[0-9]{9}|\\+?9647[0-9]{9})$", options: .regularExpression) != nil
    }
}
