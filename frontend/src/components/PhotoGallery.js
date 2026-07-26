import React, { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { 
  Maximize2, X, ChevronLeft, ChevronRight, Share2, Download, 
  Sparkles, Grid, LayoutGrid, SlidersHorizontal, ArrowRight, Check, ZoomIn, ZoomOut 
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";

export const GALLERY_ITEMS = [
  {
    id: 1,
    src: "/gallery/gallery-1.jpg",
    title: "Graduation Celebration Memories",
    category: "Celebrations",
    desc: "Unforgettable moments of joy with friends and family celebrating graduation with KaDel Ghana.",
    aspect: "aspect-[4/3]"
  },
  {
    id: 2,
    src: "/gallery/gallery-2.jpg",
    title: "Graduates Toasting Success",
    category: "Celebrations",
    desc: "Cheers to academic achievement, hard work, and bright new horizons.",
    aspect: "aspect-[3/4]"
  },
  {
    id: 3,
    src: "/gallery/gallery-3.jpg",
    title: "Elegant Table & Venue Setup",
    category: "Dining & Setup",
    desc: "Premium table arrangements thoughtfully designed for graduation dinners.",
    aspect: "aspect-[4/3]"
  },
  {
    id: 4,
    src: "/gallery/gallery-4.jpg",
    title: "Joyful Family Gathering",
    category: "Moments",
    desc: "Laughter, happiness, and shared meals surrounding your graduation milestone.",
    aspect: "aspect-[3/4]"
  },
  {
    id: 5,
    src: "/gallery/gallery-5.jpg",
    title: "Vibrant Decor & Ambience",
    category: "Dining & Setup",
    desc: "Stunning event styling and aesthetic decor curated for KaDel guests.",
    aspect: "aspect-[4/3]"
  },
  {
    id: 6,
    src: "/gallery/gallery-6.jpg",
    title: "Gourmet Catering & Dining Spread",
    category: "Dining & Setup",
    desc: "Delicious local and continental dishes crafted specially for your celebration.",
    aspect: "aspect-[4/3]"
  },
  {
    id: 7,
    src: "/gallery/gallery-7.jpg",
    title: "Celebration Drinks & Delicacies",
    category: "Dining & Setup",
    desc: "Signature drinks, wine, and sweet pastries for a memorable evening.",
    aspect: "aspect-[3/4]"
  },
  {
    id: 8,
    src: "/gallery/gallery-8.jpg",
    title: "Graduate Honor & Pride",
    category: "Moments",
    desc: "Capturing proud smiles on graduation day alongside cherished loved ones.",
    aspect: "aspect-[4/3]"
  },
  {
    id: 9,
    src: "/gallery/gallery-9.jpg",
    title: "Special Milestone Highlight",
    category: "Celebrations",
    desc: "Creating lifelong memories with KaDel Ghana's exclusive graduation dining experience.",
    aspect: "aspect-[3/4]"
  }
];

export const CATEGORIES = ["All", "Celebrations", "Dining & Setup", "Moments"];

export default function PhotoGallery({ 
  limit = null, 
  showCategoryFilter = true, 
  showViewAllBtn = false,
  title = null,
  subtitle = null
}) {
  const navigate = useNavigate();
  const [activeCategory, setActiveCategory] = useState("All");
  const [lightboxIndex, setLightboxIndex] = useState(null);
  const [layoutMode, setLayoutMode] = useState("grid"); // "grid" | "masonry"
  const [isZoomed, setIsZoomed] = useState(false);
  const [copied, setCopied] = useState(false);

  // Filter items based on active category
  const filteredItems = GALLERY_ITEMS.filter(
    (item) => activeCategory === "All" || item.category === activeCategory
  );

  const displayItems = limit ? filteredItems.slice(0, limit) : filteredItems;

  const currentLightboxItem = lightboxIndex !== null ? displayItems[lightboxIndex] : null;

  const handlePrev = useCallback(() => {
    if (lightboxIndex === null) return;
    setIsZoomed(false);
    setLightboxIndex((prev) => (prev === 0 ? displayItems.length - 1 : prev - 1));
  }, [lightboxIndex, displayItems.length]);

  const handleNext = useCallback(() => {
    if (lightboxIndex === null) return;
    setIsZoomed(false);
    setLightboxIndex((prev) => (prev === displayItems.length - 1 ? 0 : prev + 1));
  }, [lightboxIndex, displayItems.length]);

  // Handle keyboard navigation for Lightbox
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (lightboxIndex === null) return;
      if (e.key === "Escape") setLightboxIndex(null);
      if (e.key === "ArrowLeft") handlePrev();
      if (e.key === "ArrowRight") handleNext();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [lightboxIndex, handlePrev, handleNext]);

  const handleShare = async (item) => {
    const shareUrl = window.location.origin + item.src;
    if (navigator.clipboard) {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      toast.success("Image link copied to clipboard!");
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleDownload = (item) => {
    const link = document.createElement("a");
    link.href = item.src;
    link.download = `KaDel-Gallery-${item.id}.jpg`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("Download started!");
  };

  return (
    <div className="w-full space-y-8">
      {/* Header section if provided */}
      {(title || subtitle) && (
        <div className="text-center space-y-3">
          {title && (
            <h2 className="font-display text-3xl sm:text-4xl font-bold tracking-tight text-foreground">
              {title}
            </h2>
          )}
          {subtitle && (
            <p className="text-muted-foreground max-w-xl mx-auto text-base sm:text-lg">
              {subtitle}
            </p>
          )}
        </div>
      )}

      {/* Filter Tabs & Layout Controls */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 border-b border-border/60 pb-6">
        {/* Category Pills */}
        {showCategoryFilter && (
          <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
            {CATEGORIES.map((cat) => {
              const isActive = activeCategory === cat;
              return (
                <button
                  key={cat}
                  onClick={() => {
                    setActiveCategory(cat);
                    setLightboxIndex(null);
                  }}
                  className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all duration-200 cursor-pointer ${
                    isActive
                      ? "bg-primary text-primary-foreground shadow-md shadow-primary/20 scale-105"
                      : "bg-card hover:bg-accent text-muted-foreground hover:text-foreground border border-border/60"
                  }`}
                  data-testid={`filter-${cat.toLowerCase().replace(/\s+/g, '-')}`}
                >
                  {cat}
                  <span className="ml-1.5 opacity-60 text-xs font-normal">
                    ({cat === "All" ? GALLERY_ITEMS.length : GALLERY_ITEMS.filter(i => i.category === cat).length})
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {/* Layout Switcher (Grid vs Masonry) */}
        <div className="flex items-center gap-1 bg-card border border-border/60 p-1 rounded-xl shrink-0 self-center sm:self-auto">
          <button
            onClick={() => setLayoutMode("grid")}
            className={`p-2 rounded-lg transition-all ${
              layoutMode === "grid"
                ? "bg-primary/10 text-primary font-bold shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
            title="Standard Grid View"
            data-testid="layout-grid-btn"
          >
            <Grid className="h-4 w-4" />
          </button>
          <button
            onClick={() => setLayoutMode("masonry")}
            className={`p-2 rounded-lg transition-all ${
              layoutMode === "masonry"
                ? "bg-primary/10 text-primary font-bold shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
            title="Masonry Gallery View"
            data-testid="layout-masonry-btn"
          >
            <LayoutGrid className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Gallery Grid */}
      {displayItems.length === 0 ? (
        <div className="text-center py-16 bg-card rounded-3xl border border-border/60">
          <p className="text-muted-foreground text-sm">No photos found in this category.</p>
        </div>
      ) : (
        <motion.div 
          layout
          className={
            layoutMode === "masonry"
              ? "columns-1 sm:columns-2 lg:columns-3 gap-6 space-y-6"
              : "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6"
          }
        >
          <AnimatePresence>
            {displayItems.map((item, index) => (
              <motion.div
                key={item.id}
                layout
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ duration: 0.35, delay: index * 0.05 }}
                className={`group relative overflow-hidden rounded-3xl bg-card border border-border/80 shadow-sm hover:shadow-xl transition-all duration-300 cursor-pointer ${
                  layoutMode === "masonry" ? "break-inside-avoid mb-6" : ""
                }`}
                onClick={() => setLightboxIndex(index)}
                data-testid={`gallery-item-${item.id}`}
              >
                {/* Image Aspect Box */}
                <div className={`relative w-full ${layoutMode === "grid" ? "aspect-[4/3]" : item.aspect} overflow-hidden bg-muted`}>
                  <img
                    src={item.src}
                    alt={item.title}
                    loading="lazy"
                    className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500 ease-out"
                  />

                  {/* Dark gradient overlay on hover */}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/30 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col justify-between p-6">
                    {/* Top category badge */}
                    <div className="flex justify-between items-start">
                      <Badge className="bg-primary text-primary-foreground font-semibold px-3 py-1 shadow-md text-xs">
                        {item.category}
                      </Badge>
                      <div className="w-9 h-9 rounded-full bg-white/20 backdrop-blur-md text-white flex items-center justify-center group-hover:scale-110 transition-transform">
                        <Maximize2 className="h-4 w-4" />
                      </div>
                    </div>

                    {/* Bottom Title & Description */}
                    <div className="space-y-1 transform translate-y-3 group-hover:translate-y-0 transition-transform duration-300">
                      <h3 className="font-display text-lg font-bold text-white leading-snug">
                        {item.title}
                      </h3>
                      <p className="text-xs text-white/80 line-clamp-2 font-light">
                        {item.desc}
                      </p>
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </motion.div>
      )}

      {/* View All Button (if limited on landing page) */}
      {showViewAllBtn && (
        <div className="flex justify-center pt-6">
          <Button
            size="lg"
            variant="outline"
            className="rounded-xl px-8 py-6 bg-card hover:bg-accent border-border/80 font-semibold text-foreground flex items-center gap-2 shadow-sm hover:shadow transition-all"
            onClick={() => navigate("/gallery")}
            data-testid="view-full-gallery-btn"
          >
            View Full Gallery ({GALLERY_ITEMS.length} Photos) <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      )}

      {/* Interactive Lightbox Modal */}
      <AnimatePresence>
        {currentLightboxItem && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/95 backdrop-blur-xl flex flex-col justify-between items-center p-4 sm:p-6"
            onClick={(e) => {
              if (e.target === e.currentTarget) setLightboxIndex(null);
            }}
            data-testid="lightbox-modal"
          >
            {/* Top Bar */}
            <div className="w-full max-w-6xl flex items-center justify-between py-2 text-white z-10">
              <div className="flex items-center gap-3">
                <Badge variant="outline" className="text-white/80 border-white/30 text-xs px-3 py-1">
                  {currentLightboxItem.category}
                </Badge>
                <span className="text-xs text-white/60 font-mono">
                  {lightboxIndex + 1} / {displayItems.length}
                </span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setIsZoomed(!isZoomed)}
                  className="p-2.5 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer"
                  title={isZoomed ? "Zoom Out" : "Zoom In"}
                  data-testid="lightbox-zoom-btn"
                >
                  {isZoomed ? <ZoomOut className="h-4 w-4" /> : <ZoomIn className="h-4 w-4" />}
                </button>
                <button
                  onClick={() => handleShare(currentLightboxItem)}
                  className="p-2.5 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer"
                  title="Share Image Link"
                  data-testid="lightbox-share-btn"
                >
                  {copied ? <Check className="h-4 w-4 text-emerald-400" /> : <Share2 className="h-4 w-4" />}
                </button>
                <button
                  onClick={() => handleDownload(currentLightboxItem)}
                  className="p-2.5 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer"
                  title="Download Image"
                  data-testid="lightbox-download-btn"
                >
                  <Download className="h-4 w-4" />
                </button>
                <button
                  onClick={() => setLightboxIndex(null)}
                  className="p-2.5 rounded-full bg-white/20 hover:bg-white/30 text-white transition-colors cursor-pointer ml-2"
                  title="Close (Esc)"
                  data-testid="lightbox-close-btn"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            {/* Main Image View Area with Prev/Next buttons */}
            <div className="relative flex-1 w-full max-w-5xl flex items-center justify-center my-4 overflow-hidden">
              {/* Prev Button */}
              <button
                onClick={handlePrev}
                className="absolute left-2 sm:left-4 z-20 p-3.5 rounded-full bg-black/50 hover:bg-black/80 text-white border border-white/20 backdrop-blur-md transition-all shadow-lg hover:scale-110 cursor-pointer"
                title="Previous Photo (Left Arrow)"
                data-testid="lightbox-prev-btn"
              >
                <ChevronLeft className="h-6 w-6" />
              </button>

              {/* Displayed Image */}
              <motion.div
                key={currentLightboxItem.id}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: isZoomed ? 1.35 : 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.3 }}
                className={`max-h-[75vh] max-w-full flex items-center justify-center overflow-auto transition-transform ${
                  isZoomed ? "cursor-zoom-out" : "cursor-zoom-in"
                }`}
                onClick={() => setIsZoomed(!isZoomed)}
              >
                <img
                  src={currentLightboxItem.src}
                  alt={currentLightboxItem.title}
                  className="max-h-[75vh] w-auto object-contain rounded-2xl shadow-2xl border border-white/10 select-none"
                />
              </motion.div>

              {/* Next Button */}
              <button
                onClick={handleNext}
                className="absolute right-2 sm:right-4 z-20 p-3.5 rounded-full bg-black/50 hover:bg-black/80 text-white border border-white/20 backdrop-blur-md transition-all shadow-lg hover:scale-110 cursor-pointer"
                title="Next Photo (Right Arrow)"
                data-testid="lightbox-next-btn"
              >
                <ChevronRight className="h-6 w-6" />
              </button>
            </div>

            {/* Bottom Details Footer */}
            <div className="w-full max-w-4xl bg-white/10 backdrop-blur-md border border-white/15 rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row items-center justify-between gap-4 text-white z-10">
              <div className="space-y-1 text-center sm:text-left">
                <h4 className="font-display text-lg font-bold">
                  {currentLightboxItem.title}
                </h4>
                <p className="text-xs sm:text-sm text-white/80 max-w-xl font-light">
                  {currentLightboxItem.desc}
                </p>
              </div>

              <Button
                size="lg"
                className="rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground font-semibold px-6 py-3 shadow-lg flex items-center gap-2 shrink-0 cursor-pointer"
                onClick={() => {
                  setLightboxIndex(null);
                  navigate("/book");
                }}
                data-testid="lightbox-book-btn"
              >
                Reserve Your Table <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
