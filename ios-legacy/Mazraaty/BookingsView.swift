import SwiftUI

@MainActor
struct BookingsView: View {
    @EnvironmentObject private var store: AppStore
    @State private var pendingCancellation: Booking?
    @State private var cancellingID: String?
    @State private var actionError: String?

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 18) {
                NoticeView(message: "هذه طلبات مراجعة تخص هذا الجهاز. إرسال الطلب لا يحجز موعد Wix وحده. أكمل الحجز الرسمي من صفحة المزرعة، واسحب للتحديث لمتابعة الإدارة.")
                if store.isLoadingBookings { ProgressView("جارٍ تحميل الحجوزات…").frame(maxWidth: .infinity) }
                if let error = store.bookingsError {
                    NoticeView(message: error, isError: true)
                    Button("إعادة المحاولة") { Task { await store.refreshBookings() } }.buttonStyle(.bordered)
                }
                if let actionError { NoticeView(message: actionError, isError: true) }
                if store.bookings.isEmpty && !store.isLoadingBookings && store.bookingsError == nil {
                    EmptyState(symbol: "calendar.badge.plus", title: "بعد ما عندك طلبات", message: "اختار مزرعة من اكتشف، وشوف تفاصيلها حتى ترسل طلب حجز.")
                }
                ForEach(store.bookings) { booking in card(booking) }
            }
            .padding(20)
        }
        .background(Theme.canvas)
        .navigationTitle("حجوزاتي")
        .task { await store.refreshBookings() }
        .refreshable { await store.refreshBookings() }
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button { Task { await store.refreshBookings() } } label: { Image(systemName: "arrow.clockwise") }
                    .disabled(store.isLoadingBookings)
                    .accessibilityLabel("تحديث الحجوزات")
            }
        }
        .confirmationDialog("إلغاء طلب الحجز؟", isPresented: Binding(
            get: { pendingCancellation != nil },
            set: { if !$0 { pendingCancellation = nil } }
        ), titleVisibility: .visible) {
            if let booking = pendingCancellation {
                Button("إلغاء حجز \(booking.farmName)", role: .destructive) { Task { await cancel(booking) } }
            }
            Button("رجوع", role: .cancel) {}
        } message: {
            Text("يُرسل طلب الإلغاء إلى خدمة مزرعتي. تأكد من إلغاء الحجز الرسمي في Wix أو مع الإدارة أيضاً. هذا التطبيق لا يعالج مدفوعات أو مبالغ مستردة.")
        }
    }

    private func card(_ booking: Booking) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(alignment: .top) {
                Text(booking.farmName).font(.title3.bold())
                Spacer()
                Text(booking.statusLabel).font(.caption.bold())
                    .foregroundStyle(statusColor(booking.status))
                    .padding(.horizontal, 10).padding(.vertical, 7)
                    .background(statusColor(booking.status).opacity(0.08), in: Capsule())
            }
            Label(BaghdadDay.display(booking.date), systemImage: "calendar")
            HStack {
                Label("\(booking.guests) شخص", systemImage: "person.2")
                Spacer()
                Text(booking.totalIQD.iqd).fontWeight(.semibold)
            }
            .font(.subheadline).foregroundStyle(Theme.muted)
            DisclosureGroup("تفاصيل الطلب") {
                VStack(alignment: .leading, spacing: 10) {
                    Text("الاسم: \(booking.customerName)")
                    Text("الهاتف: \(booking.phone)")
                    if !booking.notes.isEmpty { Text("ملاحظات: \(booking.notes)") }
                    Text("رقم الطلب: \(booking.id)").font(.caption).textSelection(.enabled)
                }
                .font(.subheadline).frame(maxWidth: .infinity, alignment: .leading).padding(.top, 8)
            }
            if booking.status == "confirmed" {
                NoticeView(message: "الطلب مؤكد لدى الإدارة. لتغيير أو إلغاء الحجز الرسمي استخدم Wix أو تواصل مع إدارة مزرعتي.")
                if let url = store.farms.first(where: { $0.id == booking.farmId })?.officialBookingURL {
                    Link("فتح صفحة Wix", destination: url).buttonStyle(.bordered)
                }
                Link("تواصل مع الإدارة", destination: URL(string: "tel:+9647708248458")!).buttonStyle(.bordered)
            }
            if booking.canCancel {
                Button(role: .destructive) { pendingCancellation = booking } label: {
                    if cancellingID == booking.id { ProgressView() }
                    else { Label("إلغاء الطلب", systemImage: "xmark.circle") }
                }
                .buttonStyle(.bordered).disabled(cancellingID != nil)
            }
        }
        .padding(18).background(.white, in: RoundedRectangle(cornerRadius: 20))
    }

    private func statusColor(_ status: String) -> Color {
        switch status {
        case "confirmed": return Theme.forest
        case "pending": return Color(red: 0.55, green: 0.35, blue: 0.08)
        case "rejected": return .red
        default: return Theme.muted
        }
    }

    @MainActor
    private func cancel(_ booking: Booking) async {
        cancellingID = booking.id
        pendingCancellation = nil
        actionError = nil
        defer { cancellingID = nil }
        do { try await store.cancelBooking(booking) }
        catch { actionError = AppStore.message(for: error) }
    }
}
