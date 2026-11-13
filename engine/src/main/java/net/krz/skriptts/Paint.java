package net.krz.skriptts;

import java.util.List;
import org.bukkit.Location;
import org.bukkit.Material;
import org.bukkit.World;
import org.bukkit.block.Block;

/**
 * World paint: bulk block writes composed from a shape value and
 * a fill value (the Build-as-Code family). A shape is a set of
 * block positions derived from locations; a fill decides which
 * material each position gets. {@link #apply} walks the whole
 * shape inside one engine operation — the script never expands
 * into per-block statements.
 *
 * <p>Material selection is a pure function of (seed, position)
 * for the mix and noise fills, so repainting the same shape with
 * the same fill reproduces the same world exactly. The position
 * hash is a splitmix64-style mix of the seed and the block
 * coordinates; the noise fill interpolates hashed lattice values
 * (3D value noise) so spot patches cluster naturally instead of
 * scattering uniformly.</p>
 *
 * <p>Writes use {@code Block.setType(material, false)}: no
 * physics updates are applied (gravel does not fall, water does
 * not flow from the write itself), and a block already holding
 * the picked material is left untouched. Shapes and fills are
 * runtime-only values: they are never persisted (see
 * {@code Variables}).</p>
 */
final class Paint {

    private Paint() {}

    // ------------------------------------------------------------------
    // Shapes
    // ------------------------------------------------------------------

    /** A set of block positions, anchored at a location's world. */
    sealed interface Shape permits Cuboid, Sphere, Cylinder, Line {
        Location anchor();
    }

    /** Every block between two corner locations, inclusive. */
    record Cuboid(Location from, Location to) implements Shape {
        @Override
        public Location anchor() {
            return from;
        }
    }

    /** Blocks whose integer offset from the center block satisfies dx²+dy²+dz² ≤ radius². */
    record Sphere(Location center, double radius) implements Shape {
        @Override
        public Location anchor() {
            return center;
        }
    }

    /** The vertical cylinder over the center block, rising {@code height} layers from its Y. */
    record Cylinder(Location center, double radius, double height) implements Shape {
        @Override
        public Location anchor() {
            return center;
        }
    }

    /** The blocks on the segment between two locations. */
    record Line(Location from, Location to) implements Shape {
        @Override
        public Location anchor() {
            return from;
        }
    }

    // ------------------------------------------------------------------
    // Fills
    // ------------------------------------------------------------------

    /** Picks the material for one block position; null leaves the block alone. */
    sealed interface Fill permits Uniform, Mix, Noise {
        Material pick(int x, int y, int z);
    }

    /** One material everywhere. */
    record Uniform(Material material) implements Fill {
        @Override
        public Material pick(int x, int y, int z) {
            return material;
        }
    }

    /**
     * A weighted mix: the position hash selects one entry by
     * cumulative weight, so the same (seed, position) always
     * selects the same material.
     */
    record Mix(List<Part> parts, long seed) implements Fill {

        /** One mix entry: a material and its relative weight. */
        record Part(Material material, double weight) {}

        @Override
        public Material pick(int x, int y, int z) {
            double total = 0;
            for (Part p : parts) total += p.weight();
            if (total <= 0) return null;
            double u = unit(hash(seed, x, y, z)) * total;
            for (Part p : parts) {
                u -= p.weight();
                if (u < 0) return p.material();
            }
            return parts.get(parts.size() - 1).material();
        }
    }

    /**
     * A two-material scatter driven by 3D value noise: positions
     * whose noise value reaches {@code 1 - amount} get the spot
     * material, the rest get the base material. {@code amount} is
     * the approximate spot coverage (value noise is not uniformly
     * distributed, so the realized fraction varies by field).
     */
    record Noise(Material base, Material spot, double scale, double amount, long seed)
            implements Fill {
        @Override
        public Material pick(int x, int y, int z) {
            double threshold = 1.0 - Math.max(0.0, Math.min(1.0, amount));
            return noise(seed, x, y, z, scale) >= threshold ? spot : base;
        }
    }

    // ------------------------------------------------------------------
    // Application
    // ------------------------------------------------------------------

    /**
     * Writes every position of {@code shape} with the material
     * {@code fill} picks for it. When {@code replaceOnly} is
     * non-null, only positions currently holding that material
     * are written.
     */
    static void apply(Shape shape, Fill fill, Material replaceOnly) {
        if (shape == null || fill == null) return;
        World world = shape.anchor() == null ? null : shape.anchor().getWorld();
        if (world == null) return;
        if (shape instanceof Cuboid c) {
            int x0 = Math.min(c.from().getBlockX(), c.to().getBlockX());
            int x1 = Math.max(c.from().getBlockX(), c.to().getBlockX());
            int y0 = Math.min(c.from().getBlockY(), c.to().getBlockY());
            int y1 = Math.max(c.from().getBlockY(), c.to().getBlockY());
            int z0 = Math.min(c.from().getBlockZ(), c.to().getBlockZ());
            int z1 = Math.max(c.from().getBlockZ(), c.to().getBlockZ());
            for (int x = x0; x <= x1; x++) {
                for (int y = y0; y <= y1; y++) {
                    for (int z = z0; z <= z1; z++) {
                        write(world, x, y, z, fill, replaceOnly);
                    }
                }
            }
        } else if (shape instanceof Sphere s) {
            double r = s.radius();
            if (r < 0) return;
            int cx = s.center().getBlockX();
            int cy = s.center().getBlockY();
            int cz = s.center().getBlockZ();
            int bound = (int) Math.ceil(r);
            double r2 = r * r;
            for (int dx = -bound; dx <= bound; dx++) {
                for (int dy = -bound; dy <= bound; dy++) {
                    for (int dz = -bound; dz <= bound; dz++) {
                        if (dx * dx + dy * dy + dz * dz <= r2) {
                            write(world, cx + dx, cy + dy, cz + dz, fill, replaceOnly);
                        }
                    }
                }
            }
        } else if (shape instanceof Cylinder c) {
            double r = c.radius();
            if (r < 0 || c.height() <= 0) return;
            int levels = Math.max(1, (int) Math.round(c.height()));
            int cx = c.center().getBlockX();
            int cy = c.center().getBlockY();
            int cz = c.center().getBlockZ();
            int bound = (int) Math.ceil(r);
            double r2 = r * r;
            for (int dx = -bound; dx <= bound; dx++) {
                for (int dz = -bound; dz <= bound; dz++) {
                    if (dx * dx + dz * dz > r2) continue;
                    for (int dy = 0; dy < levels; dy++) {
                        write(world, cx + dx, cy + dy, cz + dz, fill, replaceOnly);
                    }
                }
            }
        } else if (shape instanceof Line l) {
            int ax = l.from().getBlockX();
            int ay = l.from().getBlockY();
            int az = l.from().getBlockZ();
            int dx = l.to().getBlockX() - ax;
            int dy = l.to().getBlockY() - ay;
            int dz = l.to().getBlockZ() - az;
            int steps = Math.max(Math.abs(dx), Math.max(Math.abs(dy), Math.abs(dz)));
            if (steps == 0) {
                write(world, ax, ay, az, fill, replaceOnly);
                return;
            }
            // Step along the dominant axis; rounding each axis
            // keeps the path connected and deterministic.
            for (int i = 0; i <= steps; i++) {
                int x = ax + (int) Math.round(dx * (double) i / steps);
                int y = ay + (int) Math.round(dy * (double) i / steps);
                int z = az + (int) Math.round(dz * (double) i / steps);
                write(world, x, y, z, fill, replaceOnly);
            }
        }
    }

    private static void write(World world, int x, int y, int z, Fill fill, Material replaceOnly) {
        Block block = world.getBlockAt(x, y, z);
        if (replaceOnly != null && block.getType() != replaceOnly) return;
        Material material = fill.pick(x, y, z);
        if (material == null || block.getType() == material) return;
        block.setType(material, false);
    }

    // ------------------------------------------------------------------
    // Seeded position hash and value noise
    // ------------------------------------------------------------------

    /** A splitmix64-style mix: the base step of every hash below. */
    private static long mix64(long h) {
        h ^= h >>> 30;
        h *= 0xBF58476D1CE4E5B9L;
        h ^= h >>> 27;
        h *= 0x94D049BB133111EBL;
        h ^= h >>> 31;
        return h;
    }

    /** A deterministic hash of (seed, position), stable across runs and servers. */
    static long hash(long seed, int x, int y, int z) {
        long h = mix64(seed + 0x9E3779B97F4A7C15L);
        h = mix64(h + x * 0xBF58476D1CE4E5B9L);
        h = mix64(h + y * 0x94D049BB133111EBL);
        h = mix64(h + z * 0x2545F4914F6CDD1DL);
        return h;
    }

    /** A hash mapped into [0, 1). */
    static double unit(long h) {
        return (h >>> 11) * 0x1.0p-53;
    }

    private static double lattice(long seed, int ix, int iy, int iz) {
        return unit(hash(seed, ix, iy, iz));
    }

    private static double smooth(double t) {
        return t * t * (3 - 2 * t);
    }

    private static double lerp(double a, double b, double t) {
        return a + (b - a) * t;
    }

    /**
     * 3D value noise at a block position: the lattice cell is
     * {@code scale} blocks wide and the corner values are the
     * seeded position hash, trilinearly interpolated with
     * smoothstep weights. The result lies in [0, 1).
     */
    static double noise(long seed, int x, int y, int z, double scale) {
        double gx = x / scale;
        double gy = y / scale;
        double gz = z / scale;
        int x0 = (int) Math.floor(gx);
        int y0 = (int) Math.floor(gy);
        int z0 = (int) Math.floor(gz);
        double ux = smooth(gx - x0);
        double uy = smooth(gy - y0);
        double uz = smooth(gz - z0);
        double c000 = lattice(seed, x0, y0, z0);
        double c100 = lattice(seed, x0 + 1, y0, z0);
        double c010 = lattice(seed, x0, y0 + 1, z0);
        double c110 = lattice(seed, x0 + 1, y0 + 1, z0);
        double c001 = lattice(seed, x0, y0, z0 + 1);
        double c101 = lattice(seed, x0 + 1, y0, z0 + 1);
        double c011 = lattice(seed, x0, y0 + 1, z0 + 1);
        double c111 = lattice(seed, x0 + 1, y0 + 1, z0 + 1);
        return lerp(
                lerp(lerp(c000, c100, ux), lerp(c010, c110, ux), uy),
                lerp(lerp(c001, c101, ux), lerp(c011, c111, ux), uy),
                uz);
    }
}
