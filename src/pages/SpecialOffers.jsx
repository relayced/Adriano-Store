export default function SpecialOffers() {
  return (
    <main className="min-h-screen bg-gray-50 px-6 py-10">
      <div className="mx-auto max-w-6xl">
        <h1 className="text-3xl font-bold text-[#0A2540] mb-8">Special Offers</h1>

        <div className="flex items-center justify-center py-20">
          <div className="w-full max-w-md rounded-2xl border bg-white shadow-sm p-8 text-center">
            <div className="text-5xl mb-4">🎁</div>
            <h2 className="text-2xl font-bold text-gray-800 mb-2">No Special Offers</h2>
            <p className="text-gray-600">
              Check back soon for amazing deals and exclusive offers!
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
