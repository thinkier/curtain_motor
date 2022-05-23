// Curtain configuration
bead_r = 2;
bead_d = bead_r * 2;
inter_bead_distance = 2;
depth = 8; // This is actually hardcoded

// Mating configuration
n_slots = 27;
tol = 0.25;

// Mounting holes configuration
shaft_tol = 0.15;
shaft_d = 8.7;
//shaft_cut = 0 - shaft_tol;
shaft_cut = 0;

// https://core-electronics.com.au/attachments/localcontent/pololu-universal-aluminum-mounting-hub-for-8mm-shaft-m3-holes-dimensions_10065ba0dd3.pdf
mounting_hole_tol = 0.2;
mounting_holes_n = 6;
mounting_holes_d = 3 + 2 * mounting_hole_tol;
mounting_holes_radial_dist = 19.05 / 2;
mounting_holes_cb = 5 + 2 * mounting_hole_tol;
mounting_holes_cb_depth = 1.5;

// Calculations
gear_r = n_slots * (bead_d + inter_bead_distance) / (2 * PI);
bead_offset_angle = 360 / n_slots;
echo("Outer diameter: ", (gear_r + 1) * 2);
echo("Gear radius: ", gear_r);

gear_ratio = 57 / 11;
steps_per_rev = 200 * gear_ratio;
torque = 44 * 57 / 11;
echo("Angular Force: ", torque * 10 / gear_r);
gear_circ = 2 * gear_r * PI;
echo("Steps per millimeter: ", steps_per_rev / gear_circ);

module catch() {
    cylinder(bead_d + 2 * tol, bead_r + 2 * tol, bead_r + 2 * tol, $fn = 60);
    linear_extrude(bead_d + 2 * tol)
        polygon([
                [bead_r, - bead_d],
                [- bead_r, 0],
                [bead_r, bead_d]
            ]);
}

module slots() {
    for (i = [0:1:n_slots - 1]) {
        translate([
                cos(bead_offset_angle * i) * gear_r,
                sin(bead_offset_angle * i) * gear_r,
                2 - tol]) {
            rotate([0, 0, bead_offset_angle * i]) {
                catch();
            }
        }
    };
}

module thread_disk() {
    translate([0, 0, 3]) {
        difference() {
            cylinder(2, gear_r + bead_r, gear_r + bead_r);
            cylinder(2, gear_r - 1, gear_r - 1);
        }
    }
}

module shaft() {
    $fn = 120;

    translate([0, 0, depth / 2]) intersection() {
        cylinder(h = depth, d = shaft_d + shaft_tol * 2, center = true);
        translate([0, shaft_cut, 0])
            cube([shaft_d + shaft_tol * 2, shaft_d + shaft_tol * 2, depth], center = true);
    }
}

module holes() {
    for (i = [0:1:mounting_holes_n - 1]) {
        rotate([0, 0, i * 360 / mounting_holes_n]) translate([mounting_holes_radial_dist, 0, 0]) {
            cylinder(h = depth, d = mounting_holes_d, $fn = 64);
            translate([0, 0, depth - mounting_holes_cb_depth])
                cylinder(h = mounting_holes_cb_depth, d = mounting_holes_cb, $fn = 64);
        }
    }
}

module curtain_bead_adaptor() {
    difference() {
        cylinder(8, r = gear_r + 1, $fn = 360);

        slots();
        thread_disk();
        shaft();
        holes();
    }
}

curtain_bead_adaptor();
