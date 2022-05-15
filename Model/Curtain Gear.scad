// Curtain configuration
bead_r = 2;
bead_d = bead_r * 2;
inter_bead_distance = 2;
depth = 8; // This is actually hardcoded

// Mating configuration
n_slots = 24;
tol = 0.25;

// Mounting holes configuration
shaft_d = 8;
shaft_cut = 1;
shaft_tol = 0.15;

// Calculations
gear_r = n_slots * (bead_d + inter_bead_distance) / (2 * PI);
bead_offset_angle = 360 / n_slots;
echo(od = (gear_r + 1) * 2);
echo(gr = gear_r);

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
        translate([0, shaft_cut - shaft_tol, 0])
            cube([shaft_d + shaft_tol * 2, shaft_d + shaft_tol * 2, depth], center = true);
    }
}

module curtain_bead_adaptor() {
    difference() {
        cylinder(8, r = gear_r + 1, $fn = 360);

        slots();
        thread_disk();
        shaft();
    }
}

curtain_bead_adaptor();
