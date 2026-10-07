import SwiftUI

@MainActor
final class AppStore: ObservableObject {
    @Published private(set) var farms: [Farm] = []
    @Published private(set) var bookings: [Booking] = []
    @Published private(set) var favorites: Set<String>
    @Published private(set) var catalogConfigured = false
    @Published private(set) var catalogMessage: String?
    @Published private(set) var isLoadingCatalog = false
    @Published private(set) var isLoadingBookings = false
    @Published var catalogError: String?
    @Published var bookingsError: String?

    private let favoriteKey = "favoriteFarmIDs"
    private var deviceGeneration = 0

    init() {
        favorites = Set(UserDefaults.standard.stringArray(forKey: favoriteKey) ?? [])
    }

    func refreshCatalog() async {
        guard !isLoadingCatalog else { return }
        isLoadingCatalog = true
        catalogError = nil
        defer { isLoadingCatalog = false }
        do {
            let response = try await APIClient.shared.catalog()
            farms = response.farms
            catalogConfigured = response.configured
            catalogMessage = response.message
        } catch {
            catalogError = Self.message(for: error)
        }
    }

    func refreshBookings() async {
        guard !isLoadingBookings else { return }
        isLoadingBookings = true
        bookingsError = nil
        let generation = deviceGeneration
        defer { isLoadingBookings = false }
        do {
            let response = try await APIClient.shared.bookings()
            guard generation == deviceGeneration else { return }
            bookings = response.bookings.sorted { $0.createdAt > $1.createdAt }
        } catch {
            guard generation == deviceGeneration else { return }
            bookingsError = Self.message(for: error)
        }
    }

    func toggleFavorite(_ id: String) {
        if favorites.contains(id) { favorites.remove(id) }
        else { favorites.insert(id) }
        UserDefaults.standard.set(Array(favorites), forKey: favoriteKey)
    }

    func cancelBooking(_ booking: Booking) async throws {
        try await APIClient.shared.cancelBooking(id: booking.id)
        if let index = bookings.firstIndex(where: { $0.id == booking.id }) { bookings[index].status = "cancelled" }
        await refreshBookings()
    }

    func eraseData() async throws {
        do { try await APIClient.shared.eraseDevice() }
        catch APIError.identityResetRequired {
            clearLocalData()
            throw APIError.identityResetRequired
        }
        clearLocalData()
    }

    func completeIdentityReset() throws { try DeviceIdentity.remove() }

    private func clearLocalData() {
        deviceGeneration += 1
        bookings = []
        bookingsError = nil
        favorites = []
        UserDefaults.standard.removeObject(forKey: favoriteKey)
    }

    static func message(for error: Error) -> String {
        if let urlError = error as? URLError {
            switch urlError.code {
            case .notConnectedToInternet, .networkConnectionLost:
                return "لا يوجد اتصال بالإنترنت. البيانات والطلبات تحتاج اتصالاً بالخدمة."
            case .timedOut:
                return "الخدمة أخذت وقتاً أطول من المتوقع. حدّث قائمة الحجوزات قبل إعادة إرسال الطلب."
            default: return "تعذّر الاتصال بالخدمة. تحقق من اتصالك وحاول مجدداً."
            }
        }
        return error.localizedDescription
    }
}
