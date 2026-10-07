import Foundation
import Security

enum APIError: LocalizedError {
    case notConfigured
    case invalidResponse
    case server(String, status: Int, code: String?)
    case identityUnavailable
    case identityResetRequired

    var errorDescription: String? {
        switch self {
        case .notConfigured: return "عنوان الخدمة غير مهيأ. يرجى إكمال إعداد التطبيق ولوحة الإدارة."
        case .invalidResponse: return "تعذّر قراءة بيانات الخدمة. حاول التحديث بعد قليل."
        case .server(let message, _, _): return message
        case .identityUnavailable: return "تعذّر حفظ هوية الحجز الآمنة على هذا الجهاز. حاول مجدداً."
        case .identityResetRequired: return "حُذفت البيانات من الخدمة، لكن تعذّرت إعادة تهيئة هوية الجهاز. أعد تهيئة الهوية لإكمال الخطوة المحلية."
        }
    }

    var statusCode: Int? {
        if case .server(_, let status, _) = self { return status }
        return nil
    }
}

enum AppConfiguration {
    static var serviceURL: URL? {
        guard let value = Bundle.main.object(forInfoDictionaryKey: "MazraatyAPIBaseURL") as? String,
              let url = URL(string: value), url.scheme == "https",
              let host = url.host, !host.isEmpty,
              !host.contains("example"), !value.contains("$(") else { return nil }
        return url
    }

    static var privacyURL: URL? { serviceURL?.appendingPathComponent("privacy") }
}

/// A private, random credential scoped to this installation. Never put Wix API keys here.
enum DeviceIdentity {
    private static let service = "com.mazraaty.booking-device"
    private static let account = "device-token"

    static func token() throws -> String {
        var query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne
        ]
        var item: CFTypeRef?
        let result = SecItemCopyMatching(query as CFDictionary, &item)
        if result == errSecSuccess,
           let data = item as? Data,
           let existing = String(data: data, encoding: .utf8), existing.count >= 32 {
            return existing
        }
        guard result == errSecItemNotFound else { throw APIError.identityUnavailable }
        let newToken = (UUID().uuidString + UUID().uuidString).replacingOccurrences(of: "-", with: "").lowercased()
        query.removeValue(forKey: kSecReturnData as String)
        query.removeValue(forKey: kSecMatchLimit as String)
        query[kSecValueData as String] = Data(newToken.utf8)
        query[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        guard SecItemAdd(query as CFDictionary, nil) == errSecSuccess else { throw APIError.identityUnavailable }
        return newToken
    }

    static func remove() throws {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account
        ]
        let result = SecItemDelete(query as CFDictionary)
        guard result == errSecSuccess || result == errSecItemNotFound else { throw APIError.identityUnavailable }
    }
}

actor APIClient {
    static let shared = APIClient()
    private let session: URLSession

    init() {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.timeoutIntervalForRequest = 30
        configuration.timeoutIntervalForResource = 60
        configuration.requestCachePolicy = .reloadIgnoringLocalCacheData
        session = URLSession(configuration: configuration)
    }

    func catalog() async throws -> CatalogResponse {
        try await decode("api/v1/catalog", authorized: false)
    }

    func availability(farmID: String) async throws -> AvailabilityResponse {
        try await decode("api/v1/unavailable", query: [URLQueryItem(name: "farmId", value: farmID)], authorized: false)
    }

    func bookings() async throws -> BookingsResponse { try await decode("api/v1/bookings") }

    func requestBooking(_ booking: BookingRequest) async throws -> BookingResponse {
        try await decode("api/v1/bookings", method: "POST", body: JSONEncoder().encode(booking))
    }

    func cancelBooking(id: String) async throws {
        _ = try await send("api/v1/bookings/\(safeComponent(id))/cancel", method: "POST")
    }

    func eraseDevice() async throws {
        _ = try await send("api/v1/device", method: "DELETE")
        do { try DeviceIdentity.remove() }
        catch { throw APIError.identityResetRequired }
    }

    private func safeComponent(_ value: String) -> String {
        value.addingPercentEncoding(withAllowedCharacters: .alphanumerics) ?? ""
    }

    private func decode<T: Decodable & Sendable>(_ path: String, method: String = "GET",
                                               query: [URLQueryItem] = [], body: Data? = nil,
                                               authorized: Bool = true) async throws -> T {
        let data = try await send(path, method: method, query: query, body: body, authorized: authorized)
        do { return try JSONDecoder().decode(T.self, from: data) }
        catch { throw APIError.invalidResponse }
    }

    private func send(_ path: String, method: String = "GET", query: [URLQueryItem] = [],
                      body: Data? = nil, authorized: Bool = true) async throws -> Data {
        guard let base = AppConfiguration.serviceURL else { throw APIError.notConfigured }
        guard var components = URLComponents(url: base, resolvingAgainstBaseURL: false)
        else { throw APIError.notConfigured }
        // Keep encoded item identifiers encoded exactly once, including Wix IDs with hyphens.
        let basePath = components.percentEncodedPath.hasSuffix("/") ? String(components.percentEncodedPath.dropLast()) : components.percentEncodedPath
        components.percentEncodedPath = basePath + "/" + path
        components.fragment = nil
        components.queryItems = nil
        if !query.isEmpty { components.queryItems = query }
        guard let url = components.url else { throw APIError.notConfigured }
        var request = URLRequest(url: url)
        request.httpMethod = method
        request.httpBody = body
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        if body != nil { request.setValue("application/json", forHTTPHeaderField: "Content-Type") }
        if authorized { request.setValue(try DeviceIdentity.token(), forHTTPHeaderField: "X-Device-Token") }
        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse else { throw APIError.invalidResponse }
        guard (200...299).contains(http.statusCode) else {
            let object = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any]
            let nestedError = object?["error"] as? [String: Any]
            let message = object?["message"] as? String ?? nestedError?["message"] as? String
            let code = nestedError?["code"] as? String ?? object?["error"] as? String
            throw APIError.server(message ?? "تعذّر إكمال الطلب حالياً (\(http.statusCode)). حاول مجدداً.", status: http.statusCode, code: code)
        }
        return data
    }
}
